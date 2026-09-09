import { prisma } from "@/lib/db";
import { splitMessage, previewOf } from "@/lib/cleanMessage";
import { readOpportunity, looksLikeTime } from "@/lib/opportunity";
import { leadAttention } from "@/lib/attention";
import { readRelationship } from "@/lib/relationshipState";
import { getNextActions } from "@/server/nextActions";
import { getAwayDigest, touchLastActive } from "@/server/awayDigest";
import { getTodayBrief } from "@/server/dashboardData";
import { findMergeCandidates } from "@/server/identity";
import { toZonedDisplayDate } from "@/lib/utils";
import { differenceInMinutes, format } from "date-fns";
import type { ChannelType, ConversationCategory } from "@prisma/client";

/**
 * What the app reads. The same readings the web dashboard makes — who is a person, what a
 * conversation is worth, what to do next — returned as plain JSON with the message bodies
 * already cleaned, so the app renders and never re-derives product logic. Every query is
 * scoped to the business the bearer session resolved to.
 */

export async function readToday(businessId: string, membershipId: string, timezone: string) {
  const now = new Date();
  const [next, brief, prev] = await Promise.all([getNextActions(businessId, now, timezone), getTodayBrief(businessId), touchLastActive(membershipId)]);
  const digest = await getAwayDigest(businessId, prev, now).catch(() => null);
  const booking = (b: { id: string; startAt: Date; status: string; location: string | null; client: { name: string }; service: { name: string } }) => ({ id: b.id, startAt: b.startAt.toISOString(), when: format(toZonedDisplayDate(b.startAt, timezone), "EEE, MMM d · h:mm a"), status: b.status, location: b.location, clientName: b.client.name, serviceName: b.service.name });
  return {
    generatedAt: now.toISOString(),
    digest: digest ? { since: digest.since.toISOString(), hoursAway: digest.hoursAway, items: digest.items, quotedCents: digest.quotedCents, estimatedCents: digest.estimatedCents, quotedCount: digest.quotedCount } : null,
    next: next.actions.map((a) => ({ ...a, since: a.since.toISOString(), booking: a.booking ? { ...a.booking, startAt: a.booking.startAt.toISOString() } : null })),
    atRisk: next.atRisk,
    today: brief.todaysBookings.map(booking),
    upcoming: brief.upcoming.map(booking),
  };
}

export type ConversationListRow = {
  id: string;
  channel: ChannelType;
  category: ConversationCategory;
  name: string;
  subject: string | null;
  preview: string;
  lastMessageAt: string;
  lastDirection: "INBOUND" | "OUTBOUND" | null;
  unread: boolean;
  waiting: boolean;
  label: string;
  reason: string;
  followUp: string | null;
  clientId: string | null;
};

export async function listConversations(businessId: string, opts: { view: "priority" | "all"; q?: string | null; channel?: ChannelType | null; filter?: "all" | "unread" | "waiting"; take?: number }): Promise<{ rows: ConversationListRow[]; counts: { priority: number; all: number; waiting: number; unread: number } }> {
  const q = opts.q?.trim() ?? "";
  const contains = q ? { contains: q, mode: "insensitive" as const } : null;
  const conversations = await prisma.conversation.findMany({
    where: { businessId, archived: false, ...(contains ? { OR: [{ subject: contains }, { externalHandle: contains }, { client: { name: contains } }, { client: { email: contains } }, { messages: { some: { body: contains } } }] } : {}) },
    include: {
      client: { select: { id: true, name: true, relationship: true } },
      lead: { select: { extractedName: true, requestedDateText: true, requestedDate: true, requestedLocation: true, budgetCents: true, estimatedValueCents: true, intent: true, serviceId: true, status: true, respondedAt: true, lastInboundAt: true, followUpAt: true, createdAt: true, service: { select: { name: true } } } },
      messages: { orderBy: { createdAt: "desc" }, take: 1, select: { body: true, direction: true, createdAt: true } },
    },
    orderBy: { lastMessageAt: "desc" },
    take: opts.take ?? 300,
  });
  const enriched = conversations.map((conv) => {
    const last = conv.messages[0];
    const isPerson = conv.category === "PRIORITY";
    const unread = Boolean(last && last.direction === "INBOUND" && (!conv.lastReadAt || conv.lastReadAt < last.createdAt));
    const waiting = isPerson && last?.direction === "INBOUND";
    const att = conv.lead ? leadAttention({ status: conv.lead.status, respondedAt: conv.lead.respondedAt, lastInboundAt: conv.lead.lastInboundAt, followUpAt: conv.lead.followUpAt, createdAt: conv.lead.createdAt, hasService: Boolean(conv.lead.serviceId), hasDate: Boolean(conv.lead.requestedDateText || conv.lead.requestedDate), hidden: conv.archived || !isPerson, hasUpcomingBooking: false }) : null;
    const opportunity = readOpportunity({
      category: conv.category,
      relationship: conv.client?.relationship ?? null,
      lead: conv.lead ? { status: conv.lead.status, intent: conv.lead.intent, respondedAt: conv.lead.respondedAt, lastInboundAt: conv.lead.lastInboundAt, followUpAt: conv.lead.followUpAt, createdAt: conv.lead.createdAt, serviceName: conv.lead.service?.name ?? null, requestedDateText: conv.lead.requestedDateText, requestedLocation: conv.lead.requestedLocation, budgetCents: conv.lead.budgetCents, estimatedValueCents: conv.lead.estimatedValueCents } : null,
      lastWordIsTheirs: waiting,
      lastInboundAt: last?.direction === "INBOUND" ? last.createdAt : null,
      archived: conv.archived,
    });
    const row: ConversationListRow = {
      id: conv.id,
      channel: conv.channel,
      category: conv.category,
      name: conv.client?.name ?? conv.lead?.extractedName ?? conv.externalHandle ?? "Unknown",
      subject: conv.subject,
      preview: last ? previewOf(last.body, 120) : "",
      lastMessageAt: conv.lastMessageAt.toISOString(),
      lastDirection: last?.direction ?? null,
      unread,
      waiting,
      label: opportunity.label,
      reason: opportunity.reason,
      followUp: !waiting && att && att.kind !== "waiting_reply" ? att.label : null,
      clientId: conv.client?.id ?? null,
    };
    return { row, isPerson, rank: opportunity.rank };
  });
  const people = enriched.filter((r) => r.isPerson);
  const inView = (opts.view === "priority" ? people : enriched).filter((r) => !opts.channel || r.row.channel === opts.channel);
  const rows = inView
    .filter((r) => (opts.filter === "unread" ? r.row.unread : opts.filter === "waiting" ? r.row.waiting : true))
    .sort((a, b) => (opts.view === "priority" && (opts.filter ?? "all") === "all" && a.rank !== b.rank ? b.rank - a.rank : Date.parse(b.row.lastMessageAt) - Date.parse(a.row.lastMessageAt)))
    .map((r) => r.row);
  return { rows, counts: { priority: people.length, all: enriched.length, waiting: people.filter((r) => r.row.waiting).length, unread: inView.filter((r) => r.row.unread).length } };
}

export async function readThread(businessId: string, conversationId: string, timezone: string) {
  const now = new Date();
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, businessId },
    include: {
      client: { include: { bookings: { include: { service: true }, orderBy: { startAt: "desc" }, take: 6 } } },
      messages: { orderBy: { createdAt: "asc" } },
      lead: { include: { service: true } },
    },
  });
  if (!conversation) return null;
  const lead = conversation.lead;
  const client = conversation.client;
  const isPerson = conversation.category === "PRIORITY";
  const lastInbound = [...conversation.messages].reverse().find((m) => m.direction === "INBOUND") ?? null;
  const lastOutbound = [...conversation.messages].reverse().find((m) => m.direction === "OUTBOUND") ?? null;
  const lastMsg = conversation.messages[conversation.messages.length - 1];
  const waitingOnYou = isPerson && lastMsg?.direction === "INBOUND";
  const upcoming = client?.bookings.filter((b) => b.startAt >= now && b.status !== "CANCELED").sort((a, b) => a.startAt.getTime() - b.startAt.getTime())[0] ?? null;
  const lastCompleted = client?.bookings.filter((b) => b.startAt < now && b.status !== "CANCELED").sort((a, b) => b.startAt.getTime() - a.startAt.getTime())[0] ?? null;
  const upcomingLabel = upcoming ? `${upcoming.service.name} · ${format(toZonedDisplayDate(upcoming.startAt, timezone), "EEE, MMM d · h:mm a")}` : null;
  const relationship = client
    ? readRelationship({
        relationship: client.relationship,
        lead: lead ? { status: lead.status, respondedAt: lead.respondedAt, lastInboundAt: lead.lastInboundAt, createdAt: lead.createdAt, hasService: Boolean(lead.serviceId), hasDate: Boolean(lead.requestedDateText || lead.requestedDate) } : null,
        lastInbound: lastInbound?.createdAt ?? null,
        lastOutbound: lastOutbound?.createdAt ?? null,
        lastOutboundWasProposal: Boolean(lastOutbound && /\$\d|\/book\//i.test(lastOutbound.body)),
        upcomingBooking: upcoming ? { startAt: upcoming.startAt, label: upcomingLabel!, status: upcoming.status } : null,
        lastCompletedBooking: lastCompleted ? { startAt: lastCompleted.startAt, label: lastCompleted.service.name } : null,
        now,
      })
    : null;
  const opportunity = readOpportunity({
    category: conversation.category,
    relationship: client?.relationship ?? null,
    lead: lead ? { status: lead.status, intent: lead.intent, respondedAt: lead.respondedAt, lastInboundAt: lead.lastInboundAt, followUpAt: lead.followUpAt, createdAt: lead.createdAt, serviceName: lead.service?.name ?? null, requestedDateText: lead.requestedDateText, requestedLocation: lead.requestedLocation, budgetCents: lead.budgetCents, estimatedValueCents: lead.estimatedValueCents } : null,
    lastWordIsTheirs: waitingOnYou,
    lastInboundAt: lastInbound?.createdAt ?? null,
    hasUpcomingBooking: Boolean(upcoming),
    upcomingUnconfirmed: upcoming ? upcoming.status === "BOOKED" : false,
    archived: conversation.archived,
    now,
  });
  let window: { open: boolean; text: string } | null = null;
  if (conversation.channel === "WHATSAPP") {
    if (!lastInbound) window = { open: false, text: "WhatsApp only allows replies within 24 hours of a customer's message, and nobody has written yet." };
    else {
      const left = 24 * 60 - differenceInMinutes(now, lastInbound.createdAt);
      window = left <= 0 ? { open: false, text: "WhatsApp's 24-hour reply window has closed. A note here is saved to the thread, not delivered." } : { open: true, text: `WhatsApp reply window: ${left >= 60 ? `${Math.floor(left / 60)}h ${left % 60}m` : `${left}m`} left.` };
    }
  }
  const facts = lead ? [
    lead.service ? { label: "Service", value: lead.service.name } : null,
    lead.requestedDateText ? { label: "Date", value: lead.requestedDateText } : null,
    lead.requestedLocation && !looksLikeTime(lead.requestedLocation) ? { label: "Location", value: lead.requestedLocation } : null,
    lead.budgetCents ? { label: "Budget", value: `$${(lead.budgetCents / 100).toLocaleString()}` } : null,
    lead.quotedCents ? { label: "Quoted", value: `$${(lead.quotedCents / 100).toLocaleString()}` } : null,
  ].filter((x): x is NonNullable<typeof x> => x !== null) : [];
  return {
    id: conversation.id,
    channel: conversation.channel,
    category: conversation.category,
    subject: conversation.subject,
    name: client?.name ?? lead?.extractedName ?? conversation.externalHandle ?? "Unknown",
    handle: conversation.externalHandle,
    isPerson,
    waitingOnYou,
    client: client ? { id: client.id, name: client.name, email: client.email, phone: client.phone, relationship: client.relationship } : null,
    lead: lead ? { id: lead.id, status: lead.status, followUpAt: lead.followUpAt?.toISOString() ?? null, canBook: lead.status !== "BOOKED" && lead.status !== "LOST" } : null,
    relationship: relationship ? { label: relationship.label, standing: relationship.standing, nextAction: relationship.nextAction } : null,
    opportunity: { label: opportunity.label, reason: opportunity.reason, nextAction: opportunity.nextAction },
    facts,
    upcoming: upcoming ? { id: upcoming.id, label: upcomingLabel, confirmed: upcoming.status !== "BOOKED" } : null,
    window,
    summary: conversation.summary ?? null,
    messages: conversation.messages.map((m) => {
      const split = splitMessage(m.body);
      return { id: m.id, direction: m.direction, text: split.text, hasMore: Boolean(split.quoted || split.signature), original: m.body, createdAt: m.createdAt.toISOString(), status: m.status, statusDetail: m.statusDetail, aiDrafted: m.aiDrafted, summary: m.summary, summarySource: m.summarySource };
    }),
  };
}

export async function listPeople(businessId: string, q?: string | null) {
  const now = new Date();
  const contains = q?.trim() ? { contains: q.trim(), mode: "insensitive" as const } : null;
  const clients = await prisma.client.findMany({
    where: { businessId, ...(contains ? { OR: [{ name: contains }, { email: contains }, { phone: contains }] } : {}) },
    include: {
      conversations: { where: { archived: false, category: "PRIORITY" }, orderBy: { lastMessageAt: "desc" }, take: 1, select: { id: true, channel: true, lastMessageAt: true, messages: { orderBy: { createdAt: "desc" }, take: 1, select: { direction: true, createdAt: true } } } },
      bookings: { where: { status: { not: "CANCELED" } }, select: { id: true, startAt: true, status: true }, orderBy: { startAt: "desc" }, take: 3 },
      leads: { orderBy: { createdAt: "desc" }, take: 1, include: { service: { select: { name: true } } } },
    },
    orderBy: { updatedAt: "desc" },
    take: 400,
  });
  const rows = clients.map((c) => {
    const conv = c.conversations[0];
    const last = conv?.messages[0];
    const upcoming = c.bookings.find((b) => b.startAt >= now);
    const lead = c.leads[0];
    const opportunity = readOpportunity({
      category: conv ? "PRIORITY" : c.relationship === "CUSTOMER" || c.bookings.length > 0 ? "PRIORITY" : null,
      relationship: c.relationship,
      lead: lead ? { status: lead.status, intent: lead.intent, respondedAt: lead.respondedAt, lastInboundAt: lead.lastInboundAt, followUpAt: lead.followUpAt, createdAt: lead.createdAt, serviceName: lead.service?.name ?? null, requestedDateText: lead.requestedDateText, requestedLocation: lead.requestedLocation, budgetCents: lead.budgetCents, estimatedValueCents: lead.estimatedValueCents } : null,
      lastWordIsTheirs: last?.direction === "INBOUND",
      lastInboundAt: last?.direction === "INBOUND" ? last.createdAt : null,
      hasUpcomingBooking: Boolean(upcoming),
      upcomingUnconfirmed: upcoming ? upcoming.status === "BOOKED" : false,
      now,
    });
    const evidence = Boolean(conv) || c.bookings.length > 0 || c.relationship === "CUSTOMER";
    return { evidence, rank: opportunity.rank, row: { id: c.id, name: c.name, email: c.email, phone: c.phone, relationship: c.relationship, label: opportunity.label, reason: opportunity.reason, lastMessageAt: conv?.lastMessageAt.toISOString() ?? null, channel: conv?.channel ?? null, conversationId: conv?.id ?? null, bookings: c.bookings.length } };
  });
  return rows.filter((r) => r.evidence).sort((a, b) => b.rank - a.rank || Date.parse(b.row.lastMessageAt ?? "0") - Date.parse(a.row.lastMessageAt ?? "0")).map((r) => r.row);
}

export async function readPerson(businessId: string, clientId: string, timezone: string) {
  const client = await prisma.client.findFirst({
    where: { id: clientId, businessId },
    include: {
      bookings: { include: { service: true }, orderBy: { startAt: "desc" } },
      conversations: { where: { archived: false }, orderBy: { lastMessageAt: "desc" }, include: { messages: { orderBy: { createdAt: "desc" }, take: 1, select: { body: true, direction: true, createdAt: true } } } },
      notes: { orderBy: { createdAt: "desc" }, include: { author: { select: { name: true } } } },
      leads: { orderBy: { createdAt: "desc" }, include: { service: true } },
    },
  });
  if (!client) return null;
  const now = new Date();
  const all = client.conversations.flatMap((c) => c.messages.map((m) => ({ ...m, conversationId: c.id })));
  const lastInbound = all.filter((m) => m.direction === "INBOUND").sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null;
  const lastOutbound = all.filter((m) => m.direction === "OUTBOUND").sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null;
  const nextBooking = client.bookings.filter((b) => b.status !== "CANCELED" && b.startAt > now).sort((a, b) => a.startAt.getTime() - b.startAt.getTime())[0] ?? null;
  const lastCompleted = client.bookings.filter((b) => b.status !== "CANCELED" && b.startAt <= now).sort((a, b) => b.startAt.getTime() - a.startAt.getTime())[0] ?? null;
  const lead = client.leads[0] ?? null;
  const standing = readRelationship({
    relationship: client.relationship,
    lead: lead ? { status: lead.status, respondedAt: lead.respondedAt, lastInboundAt: lead.lastInboundAt, createdAt: lead.createdAt, hasService: Boolean(lead.serviceId), hasDate: Boolean(lead.requestedDateText || lead.requestedDate) } : null,
    lastInbound: lastInbound?.createdAt ?? null,
    lastOutbound: lastOutbound?.createdAt ?? null,
    lastOutboundWasProposal: Boolean(lastOutbound && /\$\d|\/book\//i.test(lastOutbound.body)),
    upcomingBooking: nextBooking ? { startAt: nextBooking.startAt, label: `${nextBooking.service.name} · ${format(toZonedDisplayDate(nextBooking.startAt, timezone), "EEE, MMM d · h:mm a")}`, status: nextBooking.status } : null,
    lastCompletedBooking: lastCompleted ? { startAt: lastCompleted.startAt, label: lastCompleted.service.name } : null,
    now,
  });
  const timeline = [
    ...client.conversations.map((c) => ({ when: c.lastMessageAt.toISOString(), kind: "conversation" as const, title: `Conversation on ${c.channel.charAt(0) + c.channel.slice(1).toLowerCase()}`, meta: c.messages[0] ? previewOf(c.messages[0].body, 100) : null, href: `/conversation/${c.id}` })),
    ...client.bookings.map((b) => ({ when: b.startAt.toISOString(), kind: "booking" as const, title: b.service.name, meta: `${b.status.replaceAll("_", " ").toLowerCase()} · ${format(toZonedDisplayDate(b.startAt, timezone), "EEE, MMM d · h:mm a")}`, href: `/booking/${b.id}` })),
    ...client.leads.filter((l) => l.quotedAt && l.quotedCents).map((l) => ({ when: l.quotedAt!.toISOString(), kind: "quote" as const, title: `Quoted $${(l.quotedCents! / 100).toLocaleString()}`, meta: l.service?.name ?? null, href: l.conversationId ? `/conversation/${l.conversationId}` : null })),
    ...client.notes.map((n) => ({ when: n.createdAt.toISOString(), kind: "note" as const, title: n.body, meta: `Note · ${n.author?.name ?? "Team"}`, href: null })),
  ].sort((a, b) => Date.parse(b.when) - Date.parse(a.when));
  const candidates = await findMergeCandidates(businessId, client.id).catch(() => []);
  return {
    id: client.id,
    name: client.name,
    email: client.email,
    phone: client.phone,
    instagram: client.instagram,
    relationship: client.relationship,
    since: client.createdAt.toISOString(),
    standing: { label: standing.label, standing: standing.standing, nextAction: standing.nextAction, theyWaitFor: standing.theyWaitFor, youWaitFor: standing.youWaitFor },
    nextBooking: nextBooking ? { id: nextBooking.id, label: `${nextBooking.service.name} · ${format(toZonedDisplayDate(nextBooking.startAt, timezone), "EEE, MMM d · h:mm a")}`, confirmed: nextBooking.status !== "BOOKED" } : null,
    conversations: client.conversations.map((c) => ({ id: c.id, channel: c.channel, lastMessageAt: c.lastMessageAt.toISOString() })),
    timeline,
    mergeCandidates: candidates.map((m) => ({ id: m.id, name: m.name, basis: m.basis, why: m.why })),
  };
}
