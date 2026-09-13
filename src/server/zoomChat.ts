import { z } from "zod";
import { Prisma, type Integration } from "@prisma/client";
import { prisma } from "@/lib/db";
import { withLock } from "@/lib/dbLock";
import { ingestInboundMessage } from "@/server/leadIngestion";
import { markWebhookSeen } from "@/server/inboxSignal";
import { recordAudit } from "@/server/audit";

/**
 * Zoom Team Chat direct messages → the Daythread Inbox, through the same ingestion path
 * every other channel uses. Three events only: a DM posted, edited, or deleted. Channel
 * messages, meeting chat and the legacy `chat_message.*` family are not handled here.
 *
 * Which workspace a message belongs to comes only from the signed payload, matched to a
 * stored connection by BOTH the Zoom user id and the Zoom account id recorded at connect:
 *
 *   - someone outside the connected account writes to the owner. Zoom marks it
 *     `by_external_user` and blanks the sender's own ids; the owner is the contact
 *     (`contact_id` + `contact_account_id`). This is an inbound customer message.
 *   - the owner writes to someone outside their account, from Zoom itself or through a
 *     Daythread reply. The owner is the operator (`operator_id` + `account_id`), and the
 *     contact's ids are blank because they are external. This is an outbound message.
 *   - anything between two people in the same Zoom account is internal team chat and is
 *     never brought into the Inbox.
 *
 * A message id is only ever looked up inside the workspace the event was matched to, so an
 * edit or delete can never touch another workspace's thread, and a message is stored once
 * per workspace however many times Zoom delivers it.
 */
export const ZOOM_DM_EVENTS = ["team_chat.dm_message_posted", "team_chat.dm_message_updated", "team_chat.dm_message_deleted"] as const;
export type ZoomDmEventName = (typeof ZOOM_DM_EVENTS)[number];

/** Longest text kept from one chat message. Zoom's own send limit is 1,024; received text is capped generously. */
const MAX_TEXT = 8_000;

const zoomId = z.string().max(128).regex(/^[A-Za-z0-9_\-.=+:]*$/, "unexpected id characters");
const nonEmptyId = zoomId.min(1);

const DM_EVENT = z.object({
  event: z.enum(ZOOM_DM_EVENTS),
  event_ts: z.number().int().nonnegative(),
  payload: z.object({
    account_id: zoomId,
    operator: z.string().max(254),
    operator_id: zoomId,
    operator_member_id: z.string().max(256).optional(),
    by_external_user: z.boolean(),
    object: z.object({
      message_id: nonEmptyId,
      reply_main_message_id: z.string().max(128).nullish(),
      session_id: z.string().max(256).optional(),
      date_time: z.string().max(40).optional(),
      timestamp: z.number().int().nonnegative(),
      contact_email: z.string().max(254).optional().default(""),
      contact_id: zoomId.optional().default(""),
      contact_account_id: zoomId.optional().default(""),
      contact_member_id: z.string().max(256).optional(),
      message: z.string().max(MAX_TEXT * 2).optional(),
      files: z.array(z.unknown()).max(50).optional(),
    }),
  }),
});
export type ZoomDmEvent = z.infer<typeof DM_EVENT>;

export function parseZoomDmEvent(raw: unknown): ZoomDmEvent | null {
  const r = DM_EVENT.safeParse(raw);
  return r.success ? r.data : null;
}

export type ZoomDmIgnoreReason =
  | "unknown_connection"
  | "internal_contact"
  | "no_contact"
  | "no_text"
  | "no_thread"
  | "not_found"
  | "author_mismatch"
  | "already_deleted"
  | "stale_edit";

export type ZoomDmOutcome =
  | { status: "stored" | "updated" | "deleted" | "duplicate"; businessId: string; conversationId: string; messageId: string }
  | { status: "ignored"; reason: ZoomDmIgnoreReason; businessId?: string };

/** Rows that still own inbound traffic, including one waiting on a reconnect: Zoom does not replay a message later. */
const OWNING_STATUS = ["CONNECTED", "SYNC_ERROR", "NEEDS_ATTENTION"] as const;

const EMAIL = z.string().trim().toLowerCase().email().max(254);

type Resolved = { integration: Integration; direction: "INBOUND" | "OUTBOUND"; contactEmail: string | null };

/**
 * The connection this event belongs to, which side the owner is on, and who the other
 * person is. Null when no stored connection matches both ids, or when the other person is
 * in the same Zoom account (internal chat).
 */
async function resolve(evt: ZoomDmEvent): Promise<Resolved | { reason: ZoomDmIgnoreReason; businessId?: string }> {
  const p = evt.payload;
  const o = p.object;
  let ownerUserId: string;
  let ownerAccountId: string;
  let direction: "INBOUND" | "OUTBOUND";
  let contact: string;
  if (p.by_external_user) {
    // Someone outside the account wrote. The owner must be the contact, fully identified.
    if (!o.contact_id || !o.contact_account_id) return { reason: "unknown_connection" };
    ownerUserId = o.contact_id;
    ownerAccountId = o.contact_account_id;
    direction = "INBOUND";
    contact = p.operator;
  } else {
    if (!p.operator_id || !p.account_id) return { reason: "unknown_connection" };
    ownerUserId = p.operator_id;
    ownerAccountId = p.account_id;
    direction = "OUTBOUND";
    contact = o.contact_email ?? "";
  }

  const rows = await prisma.integration.findMany({ where: { provider: "ZOOM", externalId: ownerUserId, status: { in: [...OWNING_STATUS] } } });
  const integration = rows.find((r) => (r.settings as { accountId?: string } | null)?.accountId === ownerAccountId) ?? null;
  if (!integration) {
    // An internal colleague writing to a connected owner looks like this too: the colleague is
    // the operator and is not connected. Say "internal" when the contact is the connected owner.
    if (!p.by_external_user && o.contact_id) {
      const owner = await prisma.integration.findFirst({ where: { provider: "ZOOM", externalId: o.contact_id, status: { in: [...OWNING_STATUS] } }, select: { businessId: true, settings: true } });
      if (owner && (owner.settings as { accountId?: string } | null)?.accountId === o.contact_account_id) return { reason: "internal_contact", businessId: owner.businessId };
    }
    return { reason: "unknown_connection" };
  }
  // The owner writing to someone in their own account is internal team chat.
  if (direction === "OUTBOUND" && (o.contact_id || (o.contact_account_id && o.contact_account_id === ownerAccountId))) {
    return { reason: "internal_contact", businessId: integration.businessId };
  }
  const email = EMAIL.safeParse(contact);
  return { integration, direction, contactEmail: email.success ? email.data : null };
}

function textOf(evt: ZoomDmEvent): string {
  const text = (evt.payload.object.message ?? "").replace(/\u0000/g, "").trim();
  if (text) return text.slice(0, MAX_TEXT);
  return (evt.payload.object.files?.length ?? 0) > 0 ? "Sent a file in Zoom Chat." : "";
}

function findStored(businessId: string, messageId: string) {
  return prisma.message.findFirst({ where: { providerMessageId: messageId, conversation: { businessId, channel: "ZOOM" } }, select: { id: true, conversationId: true, direction: true, editedAt: true, deletedAt: true } });
}

export async function processZoomDmEvent(evt: ZoomDmEvent): Promise<ZoomDmOutcome> {
  const resolved = await resolve(evt);
  if (!("integration" in resolved)) return { status: "ignored", reason: resolved.reason, businessId: resolved.businessId };
  const { integration, direction, contactEmail } = resolved;
  const businessId = integration.businessId;
  const messageId = evt.payload.object.message_id;
  await markWebhookSeen(businessId, "ZOOM");

  if (evt.event === "team_chat.dm_message_posted") {
    if (!contactEmail) return { status: "ignored", reason: "no_contact", businessId };
    const body = textOf(evt);
    if (!body) return { status: "ignored", reason: "no_text", businessId };

    if (direction === "INBOUND") {
      const r = await ingestInboundMessage({
        businessId,
        channel: "ZOOM",
        senderName: contactEmail.split("@")[0],
        senderHandle: contactEmail,
        clientEmail: contactEmail,
        body,
        providerMessageId: messageId,
        // Zoom gives a webhook three seconds before redelivering; the model is not waited on.
        extraction: "rules",
      });
      const stored = await findStored(businessId, messageId);
      return { status: r.duplicate ? "duplicate" : "stored", businessId, conversationId: r.conversation.id, messageId: stored?.id ?? "" };
    }
    return storeOwnerMessage({ businessId, contactEmail, messageId, body, sentAt: new Date(evt.payload.object.timestamp) });
  }

  // Edits and deletes act only on a message this workspace already holds, by its Zoom id.
  const stored = await findStored(businessId, messageId);
  if (!stored) return { status: "ignored", reason: "not_found", businessId };
  // Only the author changes a message: the direction the event implies must match the row.
  if (stored.direction !== direction) return { status: "ignored", reason: "author_mismatch", businessId };
  if (stored.deletedAt) return { status: "ignored", reason: "already_deleted", businessId };
  const at = new Date(evt.event_ts);

  if (evt.event === "team_chat.dm_message_updated") {
    if (stored.editedAt && stored.editedAt.getTime() >= at.getTime()) return { status: "ignored", reason: "stale_edit", businessId };
    const body = textOf(evt);
    if (!body) return { status: "ignored", reason: "no_text", businessId };
    await prisma.$transaction([
      // The cached one-message summary described the old text.
      prisma.message.update({ where: { id: stored.id }, data: { body, rawBody: null, editedAt: at, summary: null, summaryAt: null, summarySource: null } }),
      prisma.conversation.update({ where: { id: stored.conversationId }, data: { summaryAt: null } }),
    ]);
    return { status: "updated", businessId, conversationId: stored.conversationId, messageId: stored.id };
  }

  // Deleted in Zoom: the words go, the row stays so the thread's order and history are honest.
  await prisma.$transaction([
    prisma.message.update({ where: { id: stored.id }, data: { body: "Message deleted in Zoom.", rawBody: null, deletedAt: at, summary: null, summaryAt: null, summarySource: null } }),
    prisma.conversation.update({ where: { id: stored.conversationId }, data: { summaryAt: null } }),
  ]);
  await recordAudit({ businessId, action: "message.deleted_by_provider", targetType: "message", targetId: stored.id, metadata: { provider: "ZOOM", direction } });
  return { status: "deleted", businessId, conversationId: stored.conversationId, messageId: stored.id };
}

/**
 * The owner wrote to a contact. If Daythread sent it, the reply is already in the thread
 * under this Zoom message id and nothing changes. If the owner typed it in Zoom, it joins
 * the existing conversation with that person so the thread shows both sides. An owner
 * starting a brand-new chat from Zoom opens no conversation on its own: the customer's
 * reply does.
 */
async function storeOwnerMessage(input: { businessId: string; contactEmail: string; messageId: string; body: string; sentAt: Date }): Promise<ZoomDmOutcome> {
  const { businessId, contactEmail, messageId, body, sentAt } = input;
  try {
    return await withLock(`ingest:${businessId}:${messageId}`, async (): Promise<ZoomDmOutcome> => {
      const existing = await findStored(businessId, messageId);
      if (existing) return { status: "duplicate", businessId, conversationId: existing.conversationId, messageId: existing.id };
      const conversation = await prisma.conversation.findFirst({ where: { businessId, channel: "ZOOM", externalHandle: contactEmail, archived: false }, orderBy: { lastMessageAt: "desc" }, select: { id: true } });
      if (!conversation) return { status: "ignored", reason: "no_thread", businessId };
      const created = await prisma.message.create({ data: { conversationId: conversation.id, direction: "OUTBOUND", body, status: "SENT", statusDetail: "sent_in_zoom", providerMessageId: messageId, createdAt: sentAt } });
      await prisma.conversation.update({ where: { id: conversation.id }, data: { lastMessageAt: new Date() } });
      await prisma.lead.updateMany({ where: { conversationId: conversation.id, businessId }, data: { respondedAt: new Date(), status: "CONTACTED" } });
      return { status: "stored", businessId, conversationId: conversation.id, messageId: created.id };
    });
  } catch (err) {
    // Daythread's own reply and Zoom's echo of it racing for the same id: the first write wins.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const existing = await findStored(businessId, messageId);
      if (existing) return { status: "duplicate", businessId, conversationId: existing.conversationId, messageId: existing.id };
    }
    throw err;
  }
}

// ── App deauthorized ─────────────────────────────────────────────────────────

/**
 * A user removed Daythread from their Zoom account. Zoom requires the app to delete that
 * user's data, so the tokens are erased, not merely flagged. The account id recorded at
 * connect must agree with the event's, so a user id alone cannot reach a connection.
 */
export async function processZoomDeauthorization(input: { userId: string; accountId: string }): Promise<void> {
  const rows = await prisma.integration.findMany({ where: { provider: "ZOOM", externalId: input.userId, status: { not: "NOT_CONNECTED" } }, select: { id: true, businessId: true, settings: true } });
  for (const row of rows) {
    if ((row.settings as { accountId?: string } | null)?.accountId !== input.accountId) continue;
    await prisma.integration.update({
      where: { id: row.id },
      data: { status: "NOT_CONNECTED", accessToken: null, refreshToken: null, tokenExpiresAt: null, externalId: null, externalAccount: null, scopes: null, settings: {}, lastError: "Daythread was removed from your Zoom account.", lastErrorAt: new Date(), lastSyncStatus: null },
    });
    await recordAudit({ businessId: row.businessId, action: "integration.revoked_by_provider", targetType: "integration", targetId: row.id, metadata: { provider: "ZOOM", event: "app_deauthorized" } });
  }
}

/** What the webhook inbox stores for a Zoom event, so a failed delivery can be replayed by the daily run. */
export type ZoomInboxPayload = { kind: "deauthorized"; userId: string; accountId: string } | { kind: "dm"; event: ZoomDmEvent } | { userId: string; accountId: string };

export async function handleZoomInboxPayload(payload: ZoomInboxPayload): Promise<void> {
  if ("kind" in payload && payload.kind === "dm") {
    const evt = parseZoomDmEvent(payload.event);
    if (evt) await processZoomDmEvent(evt);
    return;
  }
  // Rows written before chat support carried only the deauthorization ids.
  await processZoomDeauthorization({ userId: payload.userId, accountId: payload.accountId });
}
