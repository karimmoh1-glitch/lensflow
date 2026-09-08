import { prisma } from "@/lib/db";
import { deliverToCustomer, type Delivery } from "@/server/deliver";
import { draftReply } from "@/lib/ai";
import { readBusinessMemory, memoryPromptLines } from "@/lib/businessMemory";
import { shouldScheduleQuoteFollowUp, quoteFollowUpAt, parseQuoteCents } from "@/lib/quoteFollowUp";
import { getNextActions } from "@/server/nextActions";
import { track } from "@/lib/analytics";
import { toZonedDisplayDate, firstName } from "@/lib/utils";
import { format, subDays } from "date-fns";
import type { ChannelType } from "@prisma/client";

/**
 * The Daythread assistant — Pro and Business (enforced by every caller through
 * `businessAgentEntitled`; nothing in this module is reachable otherwise, see
 * src/app/actions/agent.ts and src/app/api/mobile/agent/route.ts).
 *
 * What it does today, honestly: it reads the workspace's real state — conversations
 * waiting on a reply, bookings that aren't confirmed, leads that went quiet, calendars
 * that stopped syncing — and proposes the specific action for each one,
 * with the message it would send. Nothing is sent until a person approves it. When they
 * do, the action runs through the same delivery path the composer and the automation
 * runner use, lands in the thread, and is recorded as agent activity. No fabricated
 * "autopilot": every outbound message is a real send or an honest NOT_DELIVERED.
 */
export type ProposalKind = "reply" | "confirm_booking" | "follow_up" | "reconnect_calendar";

export type AgentProposal = {
  id: string; // `${kind}:${targetId}` — re-derived on approval, never trusted from the client
  kind: ProposalKind;
  title: string;
  why: string;
  clientName: string | null;
  conversationId: string | null;
  channel: ChannelType | null;
  /** The message the agent proposes to send (editable), or null for link-only proposals. */
  draft: string | null;
  href: string | null;
  priority: number; // higher first
  valueCents: number | null;
};

export type AgentBrief = {
  generatedAt: Date;
  proposals: AgentProposal[];
  activity: Array<{ at: Date; kind: ProposalKind; title: string; result: string }>;
};

const RECENT_DAYS = 7;

export async function buildAgentBrief(businessId: string, now = new Date()): Promise<AgentBrief> {
  const business = await prisma.business.findUniqueOrThrow({ where: { id: businessId } });
  const tz = business.timezone;
  const recent = await prisma.analyticsEvent.findMany({ where: { businessId, name: "agent_action_executed", createdAt: { gte: subDays(now, RECENT_DAYS) } }, orderBy: { createdAt: "desc" }, take: 50 });
  const done = new Set(recent.map((e) => String((e.properties as { proposalId?: string } | null)?.proposalId ?? "")));

  const [next, calendars] = await Promise.all([
    getNextActions(businessId, now, tz),
    prisma.integration.findMany({ where: { businessId, provider: { in: ["GOOGLE_CALENDAR", "APPLE_CALENDAR"] }, status: { in: ["NEEDS_ATTENTION", "SYNC_ERROR"] } } }),
  ]);

  const proposals: AgentProposal[] = [];
  const first = (name: string | null | undefined) => firstName(name);

  for (const a of next.actions) {
    const idTail = a.person.leadId ?? a.person.bookingId ?? "";
    if (a.kind === "reply" && a.person.leadId) {
      const id = `reply:${idTail}`;
      if (done.has(id) || !a.person.conversationId) continue;
      const hours = Math.round((now.getTime() - a.since.getTime()) / 3_600_000);
      proposals.push({
        id,
        kind: "reply",
        title: `Reply to ${a.person.name}`,
        why: `Waiting ${hours < 1 ? "under an hour" : `${hours}h`}${a.serviceName ? ` · asked about ${a.serviceName}` : ""}${a.requestedDateText ? ` for ${a.requestedDateText}` : ""}.`,
        clientName: a.person.name,
        conversationId: a.person.conversationId,
        channel: a.channel as ChannelType | null,
        draft: null, // drafted on approval, from the real thread and the real price list
        href: a.href,
        priority: 100 + Math.min(50, hours),
        valueCents: a.value?.cents ?? null,
      });
    } else if (a.kind === "confirm_booking" && a.booking && a.person.bookingId) {
      const id = `confirm_booking:${idTail}`;
      if (done.has(id)) continue;
      const start = toZonedDisplayDate(a.booking.startAt, tz);
      proposals.push({
        id,
        kind: "confirm_booking",
        title: `Confirm ${a.person.name}'s ${a.booking.serviceName}`,
        why: `${format(start, "EEEE h:mm a")} isn't confirmed yet.`,
        clientName: a.person.name,
        conversationId: a.person.conversationId,
        channel: null,
        draft: `Hi ${first(a.person.name)} — confirming your ${a.booking.serviceName} with ${business.name} on ${format(start, "EEEE, MMMM d")} at ${format(start, "h:mm a")}${a.booking.location ? ` at ${a.booking.location}` : ""}. Reply here if anything needs to change. See you then!`,
        href: a.href,
        priority: 90,
        valueCents: a.booking.totalCents,
      });
    } else if (a.kind === "follow_up" && a.person.leadId) {
      const id = `follow_up:${idTail}`;
      if (done.has(id)) continue;
      const days = Math.round((now.getTime() - a.since.getTime()) / 86_400_000);
      proposals.push({
        id,
        kind: "follow_up",
        title: `Follow up with ${a.person.name}`,
        why: `${a.why} Nothing is booked.`,
        clientName: a.person.name,
        conversationId: a.person.conversationId,
        channel: a.channel as ChannelType | null,
        draft: `Hi ${first(a.person.name)} — just checking in from ${business.name}${a.serviceName ? ` about the ${a.serviceName}` : ""}${a.requestedDateText ? ` for ${a.requestedDateText}` : ""}. Happy to hold a date or answer anything — is this still on your mind?`,
        href: a.href,
        priority: 60 + Math.min(20, days),
        valueCents: a.value?.cents ?? null,
      });
    }
  }

  for (const cal of calendars) {
    proposals.push({
      id: `reconnect_calendar:${cal.provider}`,
      kind: "reconnect_calendar",
      title: `${cal.provider === "GOOGLE_CALENDAR" ? "Google Calendar" : "Apple Calendar"} ${cal.status === "NEEDS_ATTENTION" ? "needs reconnecting" : "stopped syncing"}`,
      why: cal.status === "NEEDS_ATTENTION" ? "Busy time isn't being read, so double-bookings are possible until it's reconnected." : `Last sync failed${cal.lastError ? `: ${cal.lastError}` : ""}.`,
      clientName: null,
      conversationId: null,
      channel: null,
      draft: null,
      href: `/dashboard/settings?tab=channels&setup=${cal.provider}`,
      priority: 95,
      valueCents: null,
    });
  }

  proposals.sort((a, b) => b.priority - a.priority);
  const activity = recent.slice(0, 12).map((e) => {
    const p = (e.properties as { kind?: ProposalKind; title?: string; result?: string } | null) ?? {};
    return { at: e.createdAt, kind: p.kind ?? "reply", title: p.title ?? "Agent action", result: p.result ?? "done" };
  });
  return { generatedAt: now, proposals, activity };
}

/** Finds one proposal again, from the database — the client only ever names an id. */
export async function findProposal(businessId: string, proposalId: string): Promise<AgentProposal | null> {
  const brief = await buildAgentBrief(businessId);
  return brief.proposals.find((p) => p.id === proposalId) ?? null;
}

/** Drafts the reply for a `reply` proposal from the real thread and price list. */
export async function draftForProposal(businessId: string, proposal: AgentProposal): Promise<string | null> {
  if (proposal.draft) return proposal.draft;
  if (proposal.kind !== "reply" || !proposal.conversationId) return null;
  const [business, conversation, services] = await Promise.all([
    prisma.business.findUniqueOrThrow({ where: { id: businessId } }),
    prisma.conversation.findFirst({ where: { id: proposal.conversationId, businessId }, include: { client: true, messages: { where: { direction: "INBOUND" }, orderBy: { createdAt: "desc" }, take: 1 } } }),
    prisma.service.findMany({ where: { businessId, active: true }, orderBy: { sortOrder: "asc" } }),
  ]);
  if (!conversation) return null;
  const memory = readBusinessMemory(business.memory);
  return draftReply({ businessName: business.name, services: services.map((s) => ({ name: s.name, priceCents: s.priceCents, durationMins: s.durationMins })), customerMessage: conversation.messages[0]?.body ?? "", customerName: conversation.client?.name, mode: "reply", memoryLines: memoryPromptLines(memory), tone: memory.tone }, { businessId, feature: "agent_draft" });
}

export type ExecutionResult = { ok: true; status: "SENT" | "NOT_DELIVERED"; note: string } | { ok: false; error: string };

/**
 * Carries out an approved proposal: sends `body` to the person the proposal is about on
 * the channel the conversation lives on (or the client's best address), records the
 * message in the thread, advances the booking/lead state only when the send really
 * happened, and logs the action. Tenant-scoped throughout.
 */
export async function executeProposal(params: { businessId: string; userId: string; proposal: AgentProposal; body: string }): Promise<ExecutionResult> {
  const { businessId, userId, proposal, body } = params;
  const business = await prisma.business.findUniqueOrThrow({ where: { id: businessId } });
  const log = (result: string) => track("agent_action_executed", { businessId, properties: { proposalId: proposal.id, kind: proposal.kind, result, userId } });

  if (proposal.kind === "reconnect_calendar") {
    return { ok: false, error: "Open the calendar's settings to reconnect it." };
  }

  // Where to send: the conversation's own channel, else the client's email or phone.
  let conversation = proposal.conversationId ? await prisma.conversation.findFirst({ where: { id: proposal.conversationId, businessId } }) : null;
  let clientId: string | null = conversation?.clientId ?? null;
  let channel: ChannelType | null = conversation?.channel ?? null;
  let to: string | null = conversation?.externalHandle ?? null;
  let bookingId: string | null = null;
  if (proposal.kind === "confirm_booking") {
    const b = await prisma.booking.findFirst({ where: { id: proposal.id.split(":")[1], businessId }, include: { client: true } });
    if (!b) return { ok: false, error: "That booking no longer exists." };
    bookingId = b.id;
    clientId = b.clientId;
    if (!conversation) conversation = await prisma.conversation.findFirst({ where: { businessId, clientId: b.clientId, archived: false }, orderBy: { lastMessageAt: "desc" } });
    channel = conversation?.channel ?? (b.client.email ? "EMAIL" : b.client.phone ? "SMS" : null);
    to = conversation?.externalHandle ?? b.client.email ?? b.client.phone ?? null;
  }
  if (!channel || !to) {
    await log("no_address");
    return { ok: false, error: "There's no address to reach them on. Add an email or phone to the client first." };
  }

  const lastInbound = conversation ? await prisma.message.findFirst({ where: { conversationId: conversation.id, direction: "INBOUND" }, orderBy: { createdAt: "desc" }, select: { createdAt: true, providerMessageId: true } }) : null;
  const delivery = await deliverToCustomer({ businessId, businessName: business.name, businessHandle: business.handle, channel, to, body, subject: conversation?.subject ? `Re: ${conversation.subject.replace(/^re:\s*/i, "")}` : `${business.name}: ${proposal.title}`, inReplyTo: channel === "EMAIL" ? lastInbound?.providerMessageId ?? null : null, lastInboundAt: lastInbound?.createdAt ?? null }).catch((err) => {
    console.error("[agent] send failed", err instanceof Error ? err.message : err);
    return { status: "FAILED", error: "Send failed", via: "none", providerMessageId: undefined } as Delivery;
  });

  const conversationId = conversation?.id ?? (clientId ? (await prisma.conversation.create({ data: { businessId, clientId, channel, externalHandle: to, lastMessageAt: new Date(), category: "PRIORITY", categoryReason: "Existing customer.", categorySource: "rules" } })).id : null);
  if (conversationId) {
    await prisma.$transaction([
      prisma.message.create({ data: { conversationId, direction: "OUTBOUND", body, aiDrafted: proposal.kind === "reply", status: delivery.status, statusDetail: delivery.statusDetail, sentByUserId: userId, providerMessageId: delivery.providerMessageId } }),
      prisma.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: new Date() } }),
      ...(delivery.status === "SENT" && (proposal.kind === "reply" || proposal.kind === "follow_up") ? [prisma.lead.updateMany({ where: { conversationId, businessId }, data: { respondedAt: new Date(), status: "CONTACTED" as const } })] : []),
    ]);
  }
  if (delivery.status === "SENT" && bookingId) await prisma.booking.updateMany({ where: { id: bookingId, businessId, status: "BOOKED" }, data: { status: "CONFIRMED", confirmedAt: new Date() } });
  // Same rule as the composer: a price that went out gets a follow-up three days later.
  if (delivery.status === "SENT" && conversationId) {
    const lead = await prisma.lead.findFirst({ where: { conversationId, businessId }, select: { id: true, status: true, followUpAt: true } });
    const quoted = lead ? parseQuoteCents(body) : null;
    if (lead && quoted) await prisma.lead.update({ where: { id: lead.id }, data: { quotedCents: quoted, quotedAt: new Date() } });
    if (lead && shouldScheduleQuoteFollowUp({ body, lead })) {
      await prisma.lead.update({ where: { id: lead.id }, data: { followUpAt: quoteFollowUpAt() } });
      await track("followup_auto_scheduled", { businessId, properties: { reason: "quote_sent", daysAhead: 3, via: "agent" } });
    }
  }

  if (delivery.status === "SENT") {
    await log("sent");
    return { ok: true, status: "SENT", note: `Sent on ${channel.toLowerCase()}.` };
  }
  if (delivery.status === "NOT_DELIVERED") {
    await log("not_delivered");
    return { ok: true, status: "NOT_DELIVERED", note: delivery.error ?? "Saved to the thread, but that channel isn't connected, so nothing was delivered." };
  }
  await log("failed");
  return { ok: false, error: delivery.error ?? "The provider rejected the send. Nothing was marked as sent." };
}
