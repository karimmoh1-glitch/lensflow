"use server";

import { prisma } from "@/lib/db";
import { requireRole, type SessionPayload } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { track } from "@/lib/analytics";
import { labelFor, type MessageCategory } from "@/lib/classifyMessage";
import { summarizeDeterministically, type ConversationSummary } from "@/lib/summarize";
import { summarizeConversationSentence } from "@/lib/ai";
import { aiEntitled, intelligenceEntitled } from "@/lib/billing";
import { splitMessage } from "@/lib/cleanMessage";
import { format } from "date-fns";
import { toZonedDisplayDate } from "@/lib/utils";
import type { ClientRelationship } from "@prisma/client";

const STAFF = ["OWNER", "ADMIN", "PHOTOGRAPHER"] as const;

function refresh() {
  revalidatePath("/dashboard/inbox");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/clients");
}

/**
 * Corrections. "Not priority" / "Mark as priority" / "This is a customer" / "Not a client"
 * change the record in front of you and are remembered for this business only: a sender
 * rule is stored for the address (and, for automated mail, its domain) so the next message
 * from them lands where you said. Nothing is deleted — a conversation moved out of Priority
 * is still in All.
 */
export async function reclassifyConversation(conversationId: string, category: MessageCategory, session?: SessionPayload | null): Promise<{ error?: string; ruleFor?: string }> {
  const ctx = await requireRole([...STAFF], session);
  if (!ctx) throw new Error("unauthorized");
  const businessId = ctx.business.id;
  const conv = await prisma.conversation.findFirst({ where: { id: conversationId, businessId }, include: { client: true, lead: true } });
  if (!conv) return { error: "Conversation not found." };

  const handle = conv.externalHandle?.toLowerCase() ?? conv.client?.email?.toLowerCase() ?? null;
  const isEmail = conv.channel === "EMAIL" && handle?.includes("@");
  const domain = isEmail ? handle!.split("@")[1] : null;
  // Remember the address. For platform / consumer domains the whole domain is remembered
  // when demoting; promoting is always address-specific (a real person at doordash.com).
  const rule: { kind: "email" | "domain"; value: string } | null = isEmail
    ? category !== "PRIORITY" && domain && /^(no-?reply|noreply|notifications?|alerts?|receipts?|orders?|billing|news|newsletter|marketing|hello|info|support|team)@/i.test(handle!)
      ? { kind: "domain", value: domain }
      : { kind: "email", value: handle! }
    : null;

  await prisma.$transaction(async (tx) => {
    const data: Record<string, unknown> = { category, categoryReason: `You marked this as ${labelFor(category).toLowerCase()}.`, categorySource: "user" };
    if (category === "PRIORITY" && !conv.clientId) {
      // Promoting to priority gives the sender a client record (and a lead, if new) so the
      // CRM knows them — exactly what the automated path deliberately didn't do.
      const name = conv.client?.name ?? guessName(conv.externalHandle) ?? "Unknown";
      const client = await tx.client.create({ data: { businessId, name, email: isEmail ? handle! : undefined, phone: conv.channel === "SMS" ? conv.externalHandle : undefined } });
      data.clientId = client.id;
      if (!conv.lead) {
        await tx.lead.create({ data: { businessId, clientId: client.id, conversationId: conv.id, extractedName: name, lastInboundAt: conv.lastMessageAt } });
      }
    }
    await tx.conversation.update({ where: { id: conv.id }, data });
    if (rule) {
      await tx.senderRule.upsert({
        where: { businessId_kind_value: { businessId, kind: rule.kind, value: rule.value } },
        create: { businessId, kind: rule.kind, value: rule.value, category },
        update: { category },
      });
    }
  });
  await track("classification_corrected", { businessId, properties: { from: conv.category, to: category, rule: rule?.kind ?? null } });
  refresh();
  return { ruleFor: rule?.value };
}

export async function setClientRelationship(clientId: string, relationship: ClientRelationship, session?: SessionPayload | null): Promise<{ error?: string }> {
  const ctx = await requireRole([...STAFF], session);
  if (!ctx) throw new Error("unauthorized");
  const r = await prisma.client.updateMany({ where: { id: clientId, businessId: ctx.business.id }, data: { relationship } });
  if (r.count === 0) return { error: "Client not found." };
  if (relationship === "CUSTOMER") await track("first_client_relationship", { businessId: ctx.business.id, properties: { via: "manual" } });
  refresh();
  revalidatePath(`/dashboard/clients/${clientId}`);
  return {};
}

export async function markConversationRead(conversationId: string, read: boolean, session?: SessionPayload | null): Promise<void> {
  const ctx = await requireRole([...STAFF], session);
  if (!ctx) throw new Error("unauthorized");
  await prisma.conversation.updateMany({ where: { id: conversationId, businessId: ctx.business.id }, data: { lastReadAt: read ? new Date() : null } });
  revalidatePath("/dashboard/inbox");
}

/** "Delete for me": hides the conversation from Daythread. The external message (Gmail,
 * SMS) is untouched and nothing is destroyed here — Undo brings it straight back. */
export async function removeConversationForMe(conversationId: string, archived = true, session?: SessionPayload | null): Promise<{ error?: string }> {
  const ctx = await requireRole([...STAFF], session);
  if (!ctx) throw new Error("unauthorized");
  const r = await prisma.conversation.updateMany({ where: { id: conversationId, businessId: ctx.business.id }, data: { archived } });
  if (r.count === 0) return { error: "Conversation not found." };
  refresh();
  return {};
}

export async function summarizeConversation(conversationId: string, opts: { force?: boolean } = {}, session?: SessionPayload | null): Promise<{ summary?: ConversationSummary; error?: string }> {
  const ctx = await requireRole([...STAFF], session);
  if (!ctx) throw new Error("unauthorized");
  const { business } = ctx;
  const conv = await prisma.conversation.findFirst({
    where: { id: conversationId, businessId: business.id },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
      client: { include: { bookings: { where: { startAt: { gte: new Date() }, status: { not: "CANCELED" } }, orderBy: { startAt: "asc" }, take: 1, include: { service: true } }, payments: { where: { status: "AWAITING_CONFIRMATION" }, take: 1 } } },
      lead: { include: { service: true } },
    },
  });
  if (!conv) return { error: "Conversation not found." };
  if (conv.messages.length === 0) return { error: "Nothing to summarize yet." };

  // Cached and still current? Reuse it.
  if (!opts.force && conv.summary && conv.summaryAt && conv.summaryAt >= conv.lastMessageAt) {
    return { summary: conv.summary as unknown as ConversationSummary };
  }

  const personName = conv.client?.name ?? conv.lead?.extractedName ?? guessName(conv.externalHandle) ?? "They";
  const upcoming = conv.client?.bookings[0];
  const upcomingLabel = upcoming ? `${upcoming.service.name} · ${format(toZonedDisplayDate(upcoming.startAt, business.timezone), "EEE, MMM d · h:mm a")}` : null;
  const cleaned = conv.messages.map((m) => ({ direction: m.direction, body: splitMessage(m.body).text, createdAt: m.createdAt }));

  const base = summarizeDeterministically({
    personName,
    relationship: conv.client?.relationship ?? null,
    channel: conv.channel,
    messages: cleaned,
    lead: conv.lead ? { serviceName: conv.lead.service?.name, requestedDateText: conv.lead.requestedDateText, requestedLocation: conv.lead.requestedLocation, budgetCents: conv.lead.budgetCents, status: conv.lead.status, respondedAt: conv.lead.respondedAt } : null,
    upcomingBookingLabel: upcomingLabel,
    hasOutstandingPayment: Boolean(conv.client?.payments.length),
  });

  let summary = base;
  if (aiEntitled(business)) {
    const sentence = await summarizeConversationSentence({ personName, businessName: business.name, messages: cleaned });
    if (sentence) summary = { ...base, summary: sentence, source: "ai" };
  }

  await prisma.conversation.update({ where: { id: conv.id }, data: { summary: summary as unknown as object, summaryAt: new Date(), summarySource: summary.source } });
  const priorSummaries = await prisma.conversation.count({ where: { businessId: business.id, summaryAt: { not: null }, id: { not: conv.id } } });
  await track(priorSummaries === 0 ? "first_summary" : "summary_generated", { businessId: business.id, properties: { source: summary.source } });
  revalidatePath("/dashboard/inbox");
  return { summary };
}

function guessName(handle: string | null | undefined): string | null {
  if (!handle) return null;
  if (handle.includes("@")) {
    const raw = handle.split("@")[0];
    // A machine address has no person behind it to name — keep the address itself.
    if (/^(no-?reply|do-?not-?reply|donotreply|noreply|notifications?|alerts?|receipts?|orders?|info|hello|support|team|billing|news|newsletter|marketing|mailer-daemon)(\+.*)?$/i.test(raw)) return handle;
    const local = raw.replace(/[._-]+/g, " ").replace(/\d+/g, "").trim();
    if (!local) return handle;
    return local.split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  }
  return handle;
}

/**
 * Ownership. A Business-plan feature: hand a conversation to a teammate. Both the
 * conversation and the membership must belong to this business; the check is server-side
 * and the plan is re-read from the database, never trusted from the client.
 */
export async function assignConversation(conversationId: string, membershipId: string | null, session?: SessionPayload | null): Promise<{ error?: string; assignee?: string | null }> {
  const ctx = await requireRole([...STAFF], session);
  if (!ctx) throw new Error("unauthorized");
  const { business } = ctx;
  if (!intelligenceEntitled(business)) return { error: "Assigning conversations to teammates is part of the Business plan." };
  const conv = await prisma.conversation.findFirst({ where: { id: conversationId, businessId: business.id }, select: { id: true } });
  if (!conv) return { error: "Conversation not found." };
  let assigneeName: string | null = null;
  if (membershipId) {
    const member = await prisma.orgMembership.findFirst({ where: { id: membershipId, businessId: business.id, status: "ACTIVE", role: { not: "CLIENT" } }, include: { user: { select: { name: true } } } });
    if (!member) return { error: "That teammate isn't in this workspace." };
    assigneeName = member.user.name;
  }
  await prisma.conversation.update({ where: { id: conv.id }, data: { assigneeMembershipId: membershipId } });
  await track("conversation_assigned", { businessId: business.id, properties: { assigned: Boolean(membershipId) } });
  refresh();
  return { assignee: assigneeName };
}
