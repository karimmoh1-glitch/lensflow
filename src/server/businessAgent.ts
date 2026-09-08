import { prisma } from "@/lib/db";
import { deliverToCustomer, type Delivery } from "@/server/deliver";
import { draftReply } from "@/lib/ai";
import { readBusinessMemory, memoryPromptLines } from "@/lib/businessMemory";
import { shouldScheduleQuoteFollowUp, quoteFollowUpAt } from "@/lib/quoteFollowUp";
import { track } from "@/lib/analytics";
import { toZonedDisplayDate, firstName } from "@/lib/utils";
import { addHours, format, subDays, subHours } from "date-fns";
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

  const [waiting, unconfirmed, quiet, calendars] = await Promise.all([
    prisma.lead.findMany({
      where: { businessId, status: { in: ["NEW", "CONTACTED", "QUALIFIED"] }, respondedAt: null, conversation: { archived: false, category: "PRIORITY" } },
      include: { client: true, service: true, conversation: { include: { messages: { orderBy: { createdAt: "desc" }, take: 1 } } } },
      orderBy: { lastInboundAt: "asc" },
      take: 12,
    }),
    prisma.booking.findMany({
      where: { businessId, status: "BOOKED", startAt: { gt: now, lte: addHours(now, 72) } },
      include: { client: true, service: true },
      orderBy: { startAt: "asc" },
      take: 10,
    }),
    prisma.lead.findMany({
      where: { businessId, status: { in: ["CONTACTED", "QUALIFIED"] }, respondedAt: { not: null, lte: subHours(now, 72) }, lastInboundAt: { lte: subHours(now, 72) } },
      include: { client: true, service: true, conversation: true },
      orderBy: { lastInboundAt: "asc" },
      take: 8,
    }),
    prisma.integration.findMany({ where: { businessId, provider: { in: ["GOOGLE_CALENDAR", "APPLE_CALENDAR"] }, status: { in: ["NEEDS_ATTENTION", "SYNC_ERROR"] } } }),
  ]);

  const proposals: AgentProposal[] = [];
  const first = (name: string | null | undefined) => firstName(name);

  for (const lead of waiting) {
    const id = `reply:${lead.id}`;
    if (done.has(id) || !lead.conversation) continue;
    const hours = lead.lastInboundAt ? Math.round((now.getTime() - lead.lastInboundAt.getTime()) / 3_600_000) : null;
    const value = lead.service?.priceCents ?? lead.estimatedValueCents ?? 0;
    proposals.push({
      id,
      kind: "reply",
      title: `Reply to ${lead.client?.name ?? lead.extractedName ?? "a new inquiry"}`,
      why: `${hours !== null ? `Waiting ${hours < 1 ? "under an hour" : `${hours}h`}` : "Waiting on you"}${lead.service ? ` · asked about ${lead.service.name}` : ""}${lead.requestedDateText ? ` for ${lead.requestedDateText}` : ""}.`,
      clientName: lead.client?.name ?? null,
      conversationId: lead.conversation.id,
      channel: lead.conversation.channel,
      draft: null, // drafted on approval, from the real thread and the real price list
      href: `/dashboard/inbox?c=${lead.conversation.id}`,
      priority: 100 + Math.min(50, hours ?? 0),
      valueCents: value || null,
    });
  }

  for (const b of unconfirmed) {
    const id = `confirm_booking:${b.id}`;
    if (done.has(id)) continue;
    const start = toZonedDisplayDate(b.startAt, tz);
    proposals.push({
      id,
      kind: "confirm_booking",
      title: `Confirm ${b.client.name}'s ${b.service.name}`,
      why: `${format(start, "EEEE h:mm a")} isn't confirmed yet.`,
      clientName: b.client.name,
      conversationId: b.conversationId ?? null,
      channel: null,
      draft: `Hi ${first(b.client.name)} — confirming your ${b.service.name} with ${business.name} on ${format(start, "EEEE, MMMM d")} at ${format(start, "h:mm a")}${b.location ? ` at ${b.location}` : ""}. Reply here if anything needs to change. See you then!`,
      href: `/dashboard/bookings/${b.id}`,
      priority: 90,
      valueCents: b.totalCents,
    });
  }

  for (const lead of quiet) {
    const id = `follow_up:${lead.id}`;
    if (done.has(id)) continue;
    const days = lead.lastInboundAt ? Math.round((now.getTime() - lead.lastInboundAt.getTime()) / 86_400_000) : null;
    proposals.push({
      id,
      kind: "follow_up",
      title: `Follow up with ${lead.client?.name ?? lead.extractedName ?? "a lead"}`,
      why: `You replied; they went quiet${days ? ` ${days} day${days === 1 ? "" : "s"} ago` : ""}${lead.service ? ` · ${lead.service.name}` : ""}. Nothing is booked.`,
      clientName: lead.client?.name ?? null,
      conversationId: lead.conversation?.id ?? null,
      channel: lead.conversation?.channel ?? null,
      draft: `Hi ${first(lead.client?.name ?? lead.extractedName)} — just checking in from ${business.name}${lead.service ? ` about the ${lead.service.name}` : ""}${lead.requestedDateText ? ` for ${lead.requestedDateText}` : ""}. Happy to hold a date or answer anything — is this still on your mind?`,
      href: lead.conversation ? `/dashboard/inbox?c=${lead.conversation.id}` : "/dashboard/inbox",
      priority: 60,
      valueCents: lead.service?.priceCents ?? lead.estimatedValueCents ?? null,
    });
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
