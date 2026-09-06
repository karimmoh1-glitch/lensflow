import { prisma } from "@/lib/db";
import { ingestInboundMessage } from "@/server/leadIngestion";
import { instagramUserProfile } from "@/lib/meta/instagram";
import { reportFailure } from "@/lib/observe";
import type { Integration } from "@prisma/client";

/**
 * Meta webhook payloads → Daythread conversations. Both Instagram (object "instagram") and
 * WhatsApp (object "whatsapp_business_account") arrive here.
 *
 * Routing is by the provider account id inside the *verified* payload — the Instagram
 * professional account id, or the WhatsApp phone number id — matched to the Integration row
 * that holds it. Nothing the sender chooses (a name, a handle, a claimed business id) can
 * move a message into another workspace, and an account nobody has connected is ignored
 * rather than guessed at. Each message is idempotent on the provider's own message id, so a
 * redelivery that slips past the envelope-level dedupe still can't duplicate a message.
 */
export type MetaEnvelope = { object: string; entry: Array<Record<string, unknown>> };
export type MetaResult = { handled: number; ignored: number; statuses: number };

type Messaging = {
  sender?: { id?: string };
  recipient?: { id?: string };
  timestamp?: number;
  message?: { mid?: string; text?: string; is_echo?: boolean; attachments?: Array<{ type?: string }> };
  read?: { mid?: string; watermark?: number };
  reaction?: unknown;
  postback?: unknown;
};

/** Only rows whose credentials still work own inbound traffic. A disconnected integration
 * owns nothing, even if Meta is still delivering for that account. */
const OWNING_STATUS = ["CONNECTED", "SYNC_ERROR"] as const;

export async function processMetaEnvelope(env: MetaEnvelope): Promise<MetaResult> {
  const out: MetaResult = { handled: 0, ignored: 0, statuses: 0 };
  if (env.object === "instagram") await processInstagram(env, out);
  else if (env.object === "whatsapp_business_account") await processWhatsApp(env, out);
  else out.ignored += env.entry?.length ?? 0;
  return out;
}

// ── Instagram ──────────────────────────────────────────────────────────────

async function processInstagram(env: MetaEnvelope, out: MetaResult): Promise<void> {
  for (const entry of env.entry ?? []) {
    const igAccountId = String(entry.id ?? "");
    if (!igAccountId) {
      out.ignored++;
      continue;
    }
    const integration = await prisma.integration.findFirst({ where: { provider: "INSTAGRAM", externalId: igAccountId, status: { in: [...OWNING_STATUS] } } });
    if (!integration) {
      out.ignored++;
      await noteUnknownAccount("INSTAGRAM", igAccountId);
      continue;
    }
    // Instagram Login delivers `entry[].messaging[]`; some app configurations deliver the
    // same events under `entry[].changes[].value.messaging[]`. Both are read.
    const messaging: Messaging[] = [
      ...((entry.messaging as Messaging[] | undefined) ?? []),
      ...(((entry.changes as Array<{ field?: string; value?: { messaging?: Messaging[] } }> | undefined) ?? []).flatMap((c) => c.value?.messaging ?? [])),
    ];
    for (const m of messaging) {
      if (m.read?.mid || m.read?.watermark) {
        out.statuses += await markInstagramRead(integration, m);
        continue;
      }
      const sender = m.sender?.id;
      const recipient = m.recipient?.id;
      const message = m.message;
      if (!sender || !message?.mid) {
        out.ignored++;
        continue;
      }
      // An echo is our own send coming back, and a message whose recipient isn't the
      // connected account isn't this workspace's conversation.
      if (message.is_echo || recipient !== igAccountId || sender === igAccountId) {
        out.ignored++;
        continue;
      }
      const text = messageText(message);
      if (!text) {
        out.ignored++;
        continue;
      }
      const profile = integration.accessToken ? await instagramUserProfile(integration.accessToken, sender) : {};
      const name = profile.name || (profile.username ? `@${profile.username}` : `Instagram user ${sender.slice(-4)}`);
      await ingestInboundMessage({
        businessId: integration.businessId,
        channel: "INSTAGRAM",
        senderName: name,
        senderHandle: sender,
        body: text,
        providerMessageId: message.mid,
      });
      out.handled++;
    }
  }
}

function messageText(message: { text?: string; attachments?: Array<{ type?: string }> }): string {
  if (message.text) return message.text;
  const kinds = (message.attachments ?? []).map((a) => a.type ?? "attachment");
  return kinds.length ? `[${kinds.join(", ")}]` : "";
}

/** A read receipt for a DM we sent, applied only to this workspace's own message. */
async function markInstagramRead(integration: Integration, m: Messaging): Promise<number> {
  const mid = m.read?.mid;
  if (!mid) return 0;
  const message = await prisma.message.findFirst({ where: { providerMessageId: mid, direction: "OUTBOUND", conversation: { businessId: integration.businessId } } });
  if (!message) return 0;
  const when = m.timestamp ? new Date(m.timestamp) : new Date();
  await prisma.message.update({ where: { id: message.id }, data: { status: "DELIVERED", readAt: message.readAt ?? when, deliveredAt: message.deliveredAt ?? when, statusDetail: "read" } });
  return 1;
}

// ── WhatsApp ───────────────────────────────────────────────────────────────

type WaValue = {
  metadata?: { phone_number_id?: string; display_phone_number?: string };
  contacts?: Array<{ wa_id?: string; profile?: { name?: string } }>;
  messages?: Array<Record<string, unknown>>;
  statuses?: Array<{ id?: string; status?: string; timestamp?: string; recipient_id?: string; errors?: Array<{ code?: number; title?: string; message?: string }> }>;
  errors?: Array<{ code?: number; title?: string }>;
};

async function processWhatsApp(env: MetaEnvelope, out: MetaResult): Promise<void> {
  for (const entry of env.entry ?? []) {
    const changes = (entry.changes as Array<{ field?: string; value?: WaValue }> | undefined) ?? [];
    for (const change of changes) {
      // Account-level fields (account_update, phone_number_quality_update, template_status_update)
      // carry no conversation; they are acknowledged, not processed.
      if (change.field !== "messages" || !change.value) {
        out.ignored++;
        continue;
      }
      const v = change.value;
      const phoneNumberId = v.metadata?.phone_number_id;
      if (!phoneNumberId) {
        out.ignored++;
        continue;
      }
      const integration = await prisma.integration.findFirst({ where: { provider: "WHATSAPP", externalId: phoneNumberId, status: { in: [...OWNING_STATUS] } } });
      if (!integration) {
        out.ignored++;
        await noteUnknownAccount("WHATSAPP", phoneNumberId);
        continue;
      }
      const contacts = v.contacts ?? [];
      for (const msg of v.messages ?? []) {
        const from = String(msg.from ?? "");
        const id = String(msg.id ?? "");
        if (!from || !id || !/^\d{5,20}$/.test(from)) {
          out.ignored++;
          continue;
        }
        const body = whatsappBody(msg);
        const name = contacts.find((c) => c.wa_id === from)?.profile?.name?.trim() || `+${from}`;
        await ingestInboundMessage({
          businessId: integration.businessId,
          channel: "WHATSAPP",
          senderName: name,
          senderHandle: `+${from}`,
          clientPhone: `+${from}`,
          body,
          providerMessageId: id,
        });
        out.handled++;
      }
      for (const st of v.statuses ?? []) {
        out.statuses += await applyWhatsAppStatus(integration, st);
      }
    }
  }
}

/** Readable text for every message type the Cloud API delivers, without inventing content. */
function whatsappBody(msg: Record<string, unknown>): string {
  const type = String(msg.type ?? "text");
  const caption = (v: unknown) => (v as { caption?: string } | undefined)?.caption?.trim();
  switch (type) {
    case "text":
      return (msg.text as { body?: string } | undefined)?.body ?? "";
    case "image":
    case "video":
    case "document":
    case "audio": {
      const c = caption(msg[type]);
      const label = type === "document" ? (msg.document as { filename?: string } | undefined)?.filename ?? "document" : type;
      return c ? `[${label}] ${c}` : `[${label}]`;
    }
    case "location": {
      const loc = msg.location as { name?: string; address?: string } | undefined;
      return `[location]${loc?.name ? ` ${loc.name}` : ""}${loc?.address ? ` — ${loc.address}` : ""}`;
    }
    case "button":
      return (msg.button as { text?: string } | undefined)?.text ?? "[button]";
    case "interactive": {
      const i = msg.interactive as { button_reply?: { title?: string }; list_reply?: { title?: string } } | undefined;
      return i?.button_reply?.title ?? i?.list_reply?.title ?? "[interactive]";
    }
    case "reaction":
      return `[reaction ${(msg.reaction as { emoji?: string } | undefined)?.emoji ?? ""}]`.trim();
    default:
      return `[${type}]`;
  }
}

/** Delivery, read and failure receipts — applied only to the owning workspace's message,
 * and never rolled backwards (a late "sent" cannot un-read a message). */
const RANK: Record<string, number> = { sent: 1, delivered: 2, read: 3 };

async function applyWhatsAppStatus(integration: Integration, st: { id?: string; status?: string; timestamp?: string; errors?: Array<{ code?: number; title?: string }> }): Promise<number> {
  if (!st.id || !st.status) return 0;
  const message = await prisma.message.findFirst({ where: { providerMessageId: st.id, conversation: { businessId: integration.businessId } } });
  if (!message) return 0;
  const ts = Number(st.timestamp);
  const when = Number.isFinite(ts) && ts > 0 ? new Date(ts * 1000) : new Date();

  if (st.status === "failed") {
    const e = st.errors?.[0];
    const detail = e ? `${e.code ?? ""} ${e.title ?? "failed"}`.trim() : "failed";
    await prisma.message.update({ where: { id: message.id }, data: { status: "FAILED", statusDetail: detail } });
    await reportFailure("delivery", "WhatsApp delivery failed", { businessId: integration.businessId, provider: "WHATSAPP", meta: { code: e?.code ?? null } });
    return 1;
  }
  // Never downgrade: Meta can redeliver an earlier status after a later one.
  const currentRank = RANK[message.statusDetail ?? ""] ?? 0;
  if ((RANK[st.status] ?? 0) <= currentRank) return 0;

  if (st.status === "delivered") {
    await prisma.message.update({ where: { id: message.id }, data: { status: "DELIVERED", deliveredAt: message.deliveredAt ?? when, statusDetail: "delivered" } });
    return 1;
  }
  if (st.status === "read") {
    await prisma.message.update({ where: { id: message.id }, data: { status: "DELIVERED", readAt: message.readAt ?? when, deliveredAt: message.deliveredAt ?? when, statusDetail: "read" } });
    return 1;
  }
  if (st.status === "sent") {
    await prisma.message.update({ where: { id: message.id }, data: { statusDetail: "sent" } });
    return 1;
  }
  return 0;
}

/**
 * An event for an account no workspace has connected. Recorded once an hour per account so
 * an operator can see a stale Meta subscription, without a log line per delivery.
 */
const noted = new Map<string, number>();
async function noteUnknownAccount(provider: "INSTAGRAM" | "WHATSAPP", accountId: string): Promise<void> {
  const key = `${provider}:${accountId}`;
  const last = noted.get(key) ?? 0;
  if (Date.now() - last < 3_600_000) return;
  noted.set(key, Date.now());
  // Only the last few characters, so an operator can recognise the account without the id
  // itself being written to the ops log.
  await reportFailure("webhook", "Meta event for an account no workspace has connected", {
    provider,
    level: "warn",
    meta: { accountSuffix: accountId.slice(-6) },
  });
}
