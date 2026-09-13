import { requireBusiness } from "@/lib/auth";
import { rowLine } from "@/components/inbox/ConversationRow";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import { format, formatDistanceToNowStrict, differenceInMinutes } from "date-fns";
import { ChevronLeft, ChevronDown, Mail, Phone, AtSign } from "lucide-react";
import { cn, initials, toZonedDisplayDate } from "@/lib/utils";
import { Composer, type WindowNotice } from "./Composer";
import { ChannelBadge, CHANNEL_META } from "@/lib/channelIcons";
import { MessageBody } from "./MessageBody";
import { MessageBubble } from "@/components/inbox/MessageBubble";
import { ConversationTools, MarkReadOnOpen } from "./ConversationTools";
import { SummaryCard } from "./SummaryCard";
import { UnderstandingCard } from "./UnderstandingCard";
import { LeadBooking } from "./LeadBooking";
import { MarkLostButton } from "./MarkLostButton";
import { AssignMenu } from "./AssignMenu";
import { teamEntitled } from "@/lib/billing";
import { splitMessage, isAcknowledgement } from "@/lib/cleanMessage";
import { understand } from "@/lib/understand";
import { readRelationship } from "@/lib/relationshipState";
import { labelFor } from "@/lib/classifyMessage";
import { leadAttention } from "@/lib/attention";
import { FollowUpControl } from "./FollowUpControl";
import { LeadStageControl } from "./LeadStageControl";
import { MessageSummary } from "./MessageSummary";
import { readOpportunity, looksLikeTime } from "@/lib/opportunity";
import type { ConversationSummary } from "@/lib/summarize";

/**
 * A message is never just a message. Beside the conversation: what Daythread read from the
 * latest message (intent, date, the next action), who this is and where you stand, what
 * they mentioned, the summary, what's booked, and — when they're ready — the booking made
 * straight from the thread. The rail is a sidebar on desktop and a disclosure on phones.
 */
export async function ThreadPanel({ conversationId, autoSummarize = false, backHref = "/dashboard/inbox" }: { conversationId: string; autoSummarize?: boolean; backHref?: string }) {
  const ctx = await requireBusiness();
  if (!ctx) redirect("/login");
  const { business } = ctx;

  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, businessId: business.id },
    include: {
      client: {
        include: {
          bookings: { include: { service: true }, orderBy: { startAt: "desc" }, take: 6 },
          conversations: { where: { id: { not: conversationId }, archived: false }, orderBy: { lastMessageAt: "desc" }, take: 4, select: { id: true, channel: true, subject: true, lastMessageAt: true, messages: { orderBy: { createdAt: "desc" }, take: 1, select: { body: true } } } },
        },
      },
      messages: { orderBy: { createdAt: "asc" } },
      lead: { include: { service: true } },
    },
  });

  if (!conversation) return <div className="flex-1 flex items-center justify-center text-ink/65 text-sm">Conversation not found</div>;

  const lead = conversation.lead;
  const client = conversation.client;
  const now = new Date();
  const tz = business.timezone;
  const team = teamEntitled(business);
  const [handled, members, services] = await Promise.all([
    lead || client?.bookings.length
      ? prisma.automationExecution.findMany({ where: { businessId: business.id, targetId: { in: [...(client?.bookings.map((b) => b.id) ?? []), ...(lead ? [lead.id] : [])] } }, include: { automation: { select: { name: true } } }, orderBy: { ranAt: "desc" }, take: 4 })
      : Promise.resolve([]),
    team ? prisma.orgMembership.findMany({ where: { businessId: business.id, status: "ACTIVE", role: { in: ["OWNER", "ADMIN", "PHOTOGRAPHER", "PARTNER"] } }, include: { user: { select: { name: true } } }, orderBy: { createdAt: "asc" } }) : Promise.resolve([]),
    lead && lead.status !== "BOOKED" && lead.status !== "LOST" ? prisma.service.findMany({ where: { businessId: business.id, active: true }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true, durationMins: true, priceCents: true } }) : Promise.resolve([]),
  ]);

  const displayName = client?.name ?? lead?.extractedName ?? conversation.externalHandle ?? "Unknown";
  const isPerson = conversation.category === "PRIORITY";
  const lastInboundMsg = [...conversation.messages].reverse().find((m) => m.direction === "INBOUND");
  const lastOutboundMsg = [...conversation.messages].reverse().find((m) => m.direction === "OUTBOUND");
  const lastMsg = conversation.messages[conversation.messages.length - 1];
  const unread = Boolean(lastInboundMsg && (!conversation.lastReadAt || conversation.lastReadAt < lastInboundMsg.createdAt));
  const waitingOnYou = isPerson && lastMsg?.direction === "INBOUND" && !isAcknowledgement(splitMessage(lastMsg.body).text);
  const upcoming = client?.bookings.filter((b) => b.startAt >= now && b.status !== "CANCELED").sort((a, b) => a.startAt.getTime() - b.startAt.getTime())[0] ?? null;
  const lastCompleted = client?.bookings.filter((b) => b.startAt < now && b.status !== "CANCELED").sort((a, b) => b.startAt.getTime() - a.startAt.getTime())[0] ?? null;
  const upcomingLabel = upcoming ? `${upcoming.service.name} · ${format(toZonedDisplayDate(upcoming.startAt, tz), "EEE, MMM d · h:mm a")}` : null;

  const relationship = client
    ? readRelationship({
        relationship: client.relationship,
        lead: lead ? { status: lead.status, respondedAt: lead.respondedAt, lastInboundAt: lead.lastInboundAt, createdAt: lead.createdAt, hasService: Boolean(lead.serviceId), hasDate: Boolean(lead.requestedDateText || lead.requestedDate) } : null,
        lastInbound: lastInboundMsg?.createdAt ?? null,
        lastOutbound: lastOutboundMsg?.createdAt ?? null,
        lastOutboundWasProposal: Boolean(lastOutboundMsg && /\$\d|\/book\//i.test(lastOutboundMsg.body)),
        upcomingBooking: upcoming ? { startAt: upcoming.startAt, label: upcomingLabel!, status: upcoming.status } : null,
        lastCompletedBooking: lastCompleted ? { startAt: lastCompleted.startAt, label: lastCompleted.service.name } : null,
        now,
      })
    : null;
  const relationshipLabel = client ? (client.relationship === "CUSTOMER" ? "Customer" : client.relationship === "CONTACT" ? "Contact" : "Potential customer") : labelFor(conversation.category);
  const latestText = lastInboundMsg ? splitMessage(lastInboundMsg.body).text : "";
  const understanding = isPerson && lastInboundMsg ? understand({ body: latestText, relationship: client?.relationship ?? null, hasUpcomingBooking: Boolean(upcoming), upcomingBookingLabel: upcomingLabel, upcomingConfirmed: upcoming ? upcoming.status !== "BOOKED" : undefined, leadStatus: lead?.status ?? null }) : null;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const cachedSummary = (conversation.summary as unknown as ConversationSummary | null) ?? null;
  const canBook = Boolean(lead && lead.status !== "BOOKED" && lead.status !== "LOST");
  const opportunity = readOpportunity({
    category: conversation.category,
    relationship: client?.relationship ?? null,
    lead: lead ? { status: lead.status, intent: lead.intent, respondedAt: lead.respondedAt, lastInboundAt: lead.lastInboundAt, followUpAt: lead.followUpAt, createdAt: lead.createdAt, serviceName: lead.service?.name ?? null, requestedDateText: lead.requestedDateText, requestedLocation: lead.requestedLocation, budgetCents: lead.budgetCents, estimatedValueCents: lead.estimatedValueCents } : null,
    lastWordIsTheirs: waitingOnYou,
    lastInboundAt: lastInboundMsg?.createdAt ?? null,
    hasUpcomingBooking: Boolean(upcoming),
    upcomingUnconfirmed: upcoming ? upcoming.status === "BOOKED" : false,
    archived: conversation.archived,
    now,
  });
  const attention = lead ? leadAttention({ status: lead.status, respondedAt: lead.respondedAt, lastInboundAt: lead.lastInboundAt, followUpAt: lead.followUpAt, createdAt: lead.createdAt, hasService: Boolean(lead.serviceId), hasDate: Boolean(lead.requestedDateText || lead.requestedDate), hidden: conversation.archived || !isPerson, hasUpcomingBooking: Boolean(upcoming) }, now) : null;

  // WhatsApp's 24-hour customer-service window, told before the person writes.
  let windowNotice: WindowNotice = null;
  if (conversation.channel === "WHATSAPP") {
    if (!lastInboundMsg) windowNotice = { open: false, text: "WhatsApp only allows replies within 24 hours of a customer's message, and nobody has written yet. A note here is saved to the thread, not delivered." };
    else {
      const minutesLeft = 24 * 60 - differenceInMinutes(now, lastInboundMsg.createdAt);
      if (minutesLeft <= 0) windowNotice = { open: false, text: "WhatsApp's 24-hour reply window has closed for this conversation. A note here is saved to the thread; it will be delivered only if they write again first, or with an approved template." };
      else windowNotice = { open: true, endsIn: minutesLeft >= 60 ? `${Math.floor(minutesLeft / 60)}h ${minutesLeft % 60}m` : `${minutesLeft}m` };
    }
  }

  const handle = conversation.externalHandle?.replace(/^@/, "").toLowerCase() ?? null;
  const contact = [
    client?.email ? { icon: Mail, value: client.email, href: `mailto:${client.email}` } : null,
    client?.phone ? { icon: Phone, value: client.phone, href: `tel:${client.phone}` } : null,
    client?.instagram ? { icon: AtSign, value: client.instagram.replace(/^@/, ""), href: `https://instagram.com/${client.instagram.replace(/^@/, "")}` } : null,
  ].filter((x): x is NonNullable<typeof x> => x !== null && x.value.replace(/^@/, "").toLowerCase() !== handle);
  const facts = lead ? [
    lead.service ? { label: "Service", value: lead.service.name } : null,
    lead.requestedDateText ? { label: "Date", value: lead.requestedDateText } : null,
    lead.requestedLocation && !looksLikeTime(lead.requestedLocation) ? { label: "Location", value: lead.requestedLocation } : null,
    lead.budgetCents ? { label: "Budget", value: `$${(lead.budgetCents / 100).toLocaleString()}` } : null,
  ].filter((x): x is NonNullable<typeof x> => x !== null) : [];

  const rail = (
    <>
      <div className="px-5 pt-4 pb-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div aria-hidden className={cn("w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold shrink-0", isPerson ? "bg-ink/[0.07] text-ink/75" : "bg-ink/[0.04] text-ink/65")}>{initials(displayName)}</div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-ink truncate">{displayName}</div>
            <div className="text-xs text-ink/65 truncate">{relationshipLabel}{relationship ? ` · ${relationship.label}` : ""}</div>
          </div>
        </div>
        {relationship && (
          <p className="mt-3 flex items-start gap-2 text-13 text-ink/75">
            <span aria-hidden className={cn("mt-[7px] w-1.5 h-1.5 rounded-full shrink-0", relationship.tone === "signal" ? "bg-accent" : relationship.tone === "outcome" ? "bg-success" : relationship.tone === "warning" ? "bg-warning" : relationship.tone === "thinking" ? "bg-signal" : "bg-ink/30")} />
            {relationship.standing}
          </p>
        )}
        {contact.length > 0 && (
          <ul className="mt-3 space-y-0.5">
            {contact.map((c) => (
              <li key={c.value}>
                <a href={c.href} target={c.href.startsWith("http") ? "_blank" : undefined} rel="noreferrer" className="inline-flex items-center gap-2 min-h-[28px] text-13 text-ink/70 hover:text-ink max-w-full">
                  <c.icon className="w-3.5 h-3.5 text-ink/55 shrink-0" strokeWidth={1.75} aria-hidden />
                  <span className="truncate">{c.value}</span>
                </a>
              </li>
            ))}
          </ul>
        )}
        {!isPerson && conversation.categoryReason && <p className="mt-2.5 text-13 text-ink/65">{conversation.categoryReason}</p>}
        {client && (
          <Link href={`/dashboard/clients/${client.id}`} className="inline-flex items-center min-h-[32px] mt-1 text-13 font-medium text-ink hover:underline underline-offset-2">Open profile</Link>
        )}
      </div>

      {understanding && (
        <div className="px-5 py-5 border-b border-border">
          <UnderstandingCard
            u={understanding}
            who={displayName}
            relationshipLabel={relationshipLabel}
            why={opportunity.rank > 0 ? rowLine(opportunity.reason, waitingOnYou) : null}
            facts={facts}
            quote={latestText.replace(/\s+/g, " ").slice(0, 160)}
            bookingId={upcoming?.id ?? null}
            bookingHref={upcoming ? `/dashboard/bookings/${upcoming.id}` : null}
            bookingPageUrl={`${appUrl}/book/${business.handle}`}
            hasService={Boolean(lead?.service)}
          />
        </div>
      )}

      <div className="divide-y divide-border">
        {upcoming && (
          <RailSection title="On the calendar">
            <Link href={`/dashboard/bookings/${upcoming.id}`} className="flex items-stretch gap-3 rounded-lg border border-border px-3 py-2.5 hover:bg-paper transition-colors">
              <span aria-hidden className={cn("w-[3px] rounded-full shrink-0", upcoming.status === "BOOKED" ? "bg-warning" : "bg-booking")} />
              <span className="min-w-0 flex-1">
                <span className="block text-13 font-medium text-ink truncate">{upcoming.service.name}</span>
                <span className="block text-xs text-ink/65">{format(toZonedDisplayDate(upcoming.startAt, tz), "EEE, MMM d · h:mm a")}</span>
                {upcoming.status === "BOOKED" && <span className="block text-xs text-warning-text">Not confirmed yet</span>}
              </span>
            </Link>
          </RailSection>
        )}

        {isPerson && (
          <div className="px-5 py-4">
            <SummaryCard conversationId={conversation.id} initial={cachedSummary} autoRun={autoSummarize} />
          </div>
        )}

        {facts.length > 0 && !understanding && (
          <RailSection title="They mentioned">
            <dl className="space-y-1.5 text-13">{facts.map((f) => <Row key={f.label} label={f.label} value={f.value} />)}</dl>
          </RailSection>
        )}

        {lead && lead.status !== "BOOKED" && lead.status !== "LOST" && (
          <div className="px-5 py-4 space-y-5">
            <FollowUpControl leadId={lead.id} followUpAt={lead.followUpAt ? lead.followUpAt.toISOString() : null} />
            {relationship && <LeadStageControl leadId={lead.id} status={lead.status} stageLabel={relationship.label} stageWhy={relationship.standing} />}
          </div>
        )}

        {canBook && lead && (
          <div id="book-from-here" className="px-5 py-4 space-y-3">
            <h3 className="text-xs font-medium text-ink/65">Book from here</h3>
            {waitingOnYou && lastInboundMsg && <p className="text-13 text-ink/70" suppressHydrationWarning>Waiting {formatDistanceToNowStrict(lastInboundMsg.createdAt)}. Reply, or put a time on the calendar.</p>}
            <LeadBooking leadId={lead.id} serviceId={lead.service?.id ?? null} services={services} timezone={tz} />
            <MarkLostButton leadId={lead.id} />
          </div>
        )}

        {client && client.bookings.length > 0 && (
          <RailSection title="Bookings">
            <ul className="-mx-2">
              {client.bookings.slice(0, 4).map((b) => (
                <li key={b.id}>
                  <Link href={`/dashboard/bookings/${b.id}`} className="flex items-center gap-2.5 rounded px-2 py-1.5 hover:bg-paper">
                    <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", b.status === "CANCELED" ? "bg-ink/25" : b.status === "COMPLETED" || b.status === "FOLLOWED_UP" ? "bg-success" : b.status === "BOOKED" ? "bg-warning" : "bg-booking")} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block text-13 text-ink truncate">{b.service.name}</span>
                      <span className="block text-xs text-ink/65 first-letter:uppercase">{b.status.replaceAll("_", " ").toLowerCase()}</span>
                    </span>
                    <span className="text-xs text-ink/65 tabular-nums shrink-0">{format(toZonedDisplayDate(b.startAt, tz), "MMM d")}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </RailSection>
        )}

        {handled.length > 0 && (
          <RailSection title="Daythread sent for you">
            <ul className="space-y-1.5 text-13 text-ink/75">
              {handled.map((h) => (
                <li key={h.id} className="flex items-start gap-2">
                  <span aria-hidden className={cn("mt-[7px] w-1.5 h-1.5 rounded-full shrink-0", h.result === "sent" ? "bg-success" : h.result === "failed" ? "bg-danger" : "bg-ink/30")} />
                  <span>{h.result === "sent" ? "Sent" : h.result === "not_configured" ? "Tried to send" : h.result === "failed" ? "Failed to send" : h.result === "pending" ? "Sending" : "Skipped"} {h.automation.name.toLowerCase()} · {format(h.ranAt, "MMM d")}{h.result === "not_configured" && <span className="text-warning-text"> — channel not connected</span>}</span>
                </li>
              ))}
            </ul>
          </RailSection>
        )}

        {client && client.conversations.length > 0 && (
          <RailSection title="Other conversations">
            <ul className="-mx-2">
              {client.conversations.map((c) => (
                <li key={c.id}>
                  <Link href={`/dashboard/inbox?c=${c.id}`} className="flex items-start gap-2.5 rounded px-2 py-1.5 hover:bg-paper">
                    <ChannelBadge channel={c.channel} className="mt-0.5" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-13 text-ink truncate">{c.subject ?? CHANNEL_META[c.channel].label}</span>
                      <span className="block text-xs text-ink/65 truncate">{splitMessage(c.messages[0]?.body ?? "").text.slice(0, 80)}</span>
                    </span>
                    <span className="text-xs text-ink/65 tabular-nums shrink-0">{format(toZonedDisplayDate(c.lastMessageAt, tz), "MMM d")}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </RailSection>
        )}
      </div>
    </>
  );

  return (
    <div className="flex-1 flex min-w-0 min-h-0 h-full">
      <MarkReadOnOpen conversationId={conversation.id} unread={unread} />
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <div className="h-14 px-2 md:px-5 border-b border-border bg-white flex items-center gap-2 md:gap-3 shrink-0">
          <Link href={backHref} className="lg:hidden w-10 h-10 flex items-center justify-center rounded hover:bg-ink/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/70" aria-label="Back to inbox">
            <ChevronLeft className="w-5 h-5 text-ink/65" strokeWidth={1.75} />
          </Link>
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-sm text-ink truncate"><span className="sr-only">Conversation with </span>{displayName}</h2>
            <div className="flex items-center gap-1.5 text-xs text-ink/65 truncate">
              <ChannelBadge channel={conversation.channel} />
              {CHANNEL_META[conversation.channel].label}
              {conversation.externalHandle ? ` · ${conversation.externalHandle}` : ""}
              {conversation.subject ? ` · ${conversation.subject}` : ""}
            </div>
          </div>
          {waitingOnYou && (
            <span className="hidden 2xl:inline-flex items-center gap-1.5 text-xs text-accent-text shrink-0"><span aria-hidden className="w-1.5 h-1.5 rounded-full bg-accent" />Waiting on you</span>
          )}
          {team && <AssignMenu conversationId={conversation.id} members={members.map((m) => ({ membershipId: m.id, name: m.user.name, role: m.role }))} current={conversation.assigneeMembershipId} />}
          <ConversationTools conversationId={conversation.id} unread={unread} category={conversation.category} clientId={client?.id ?? null} relationship={client?.relationship ?? null} variant="header" />
        </div>

        <details className="xl:hidden border-b border-border bg-paper group/ctx">
          <summary className="flex items-center gap-2 px-4 min-h-[44px] text-13 text-ink/75 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
            <span aria-hidden className={cn("w-1.5 h-1.5 rounded-full shrink-0", understanding && understanding.nextAction.kind !== "none" ? "bg-signal" : "bg-ink/30")} />
            <span className="min-w-0 truncate">{understanding && understanding.nextAction.kind !== "none" ? <><span className="text-ink/65">Next: </span><span className="font-medium text-ink">{understanding.nextAction.label}</span></> : <>About {displayName}</>}</span>
            <ChevronDown className="ml-auto w-4 h-4 text-ink/55 shrink-0 transition-transform group-open/ctx:rotate-180" strokeWidth={1.75} aria-hidden />
          </summary>
          <div className="max-h-[60vh] overflow-y-auto scrollbar-thin bg-white border-t border-border">{rail}</div>
        </details>

        <div className="flex-1 overflow-y-auto scrollbar-thin px-4 md:px-8 py-6 space-y-3 overscroll-contain bg-white">
          {conversation.messages.map((m, i) => {
            const prev = conversation.messages[i - 1];
            const newDay = !prev || toZonedDisplayDate(prev.createdAt, tz).toDateString() !== toZonedDisplayDate(m.createdAt, tz).toDateString();
            return (
              <div key={m.id} className="space-y-3">
                {newDay && (
                  <div className="flex items-center gap-3 pt-2 pb-1" aria-hidden>
                    <span className="flex-1 h-px bg-border" />
                    <span className="text-xs text-ink/65">{format(toZonedDisplayDate(m.createdAt, tz), "EEEE, MMMM d")}</span>
                    <span className="flex-1 h-px bg-border" />
                  </div>
                )}
                <MessageBubble
                  direction={m.direction}
                  status={m.status}
                  className="group/msg"
                  arrive={i >= conversation.messages.length - 2}
                  meta={
                    <>
                      {m.status === "FAILED" && <span className="text-danger-text">Failed to send · </span>}
                      {m.status === "NOT_DELIVERED" && <span className="text-warning-text">Not delivered — {m.statusDetail === "too_long" ? "too long for Zoom Chat" : m.statusDetail === "scope_missing" ? "reconnect Zoom to allow chat replies" : <>{CHANNEL_META[conversation.channel].label} isn&rsquo;t connected</>} · </span>}
                      {m.status === "DELIVERED" && m.direction === "OUTBOUND" && <span className="text-success-text">Delivered · </span>}
                      {m.aiDrafted && <span className="text-ink/75">AI drafted · </span>}
                      {m.direction === "OUTBOUND" && m.statusDetail === "sent_in_zoom" && <span>Sent in Zoom · </span>}
                      {m.direction === "OUTBOUND" && !m.sentByUserId && !m.aiDrafted && m.statusDetail !== "sent_in_zoom" && <span className="text-ink/75">Sent by Daythread · </span>}
                      {m.editedAt && !m.deletedAt && <span>Edited · </span>}
                      <time dateTime={m.createdAt.toISOString()}>{format(toZonedDisplayDate(m.createdAt, tz), "h:mm a")}</time>
                    </>
                  }
                >
                  {m.deletedAt ? <p className="text-sm italic text-ink/60">Message deleted in Zoom.</p> : <MessageBody body={m.body} outbound={m.direction === "OUTBOUND"} />}
                  {m.direction === "INBOUND" && isPerson && <MessageSummary messageId={m.id} outbound={false} initial={m.summary ?? null} initialSource={m.summarySource === "ai" ? "ai" : m.summarySource === "rules" ? "rules" : null} />}
                </MessageBubble>
              </div>
            );
          })}
        </div>

        <Composer conversationId={conversation.id} windowNotice={windowNotice} channelLabel={CHANNEL_META[conversation.channel].label} />
      </div>

      <aside className="hidden xl:flex w-[320px] 2xl:w-[352px] shrink-0 border-l border-border bg-white flex-col overflow-y-auto scrollbar-thin" aria-label={`About ${displayName}`}>{rail}</aside>
    </div>
  );
}

function RailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="px-5 py-4">
      <h3 className="text-xs font-medium text-ink/65 mb-2">{title}</h3>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-ink/70 shrink-0">{label}</dt>
      <dd className="text-ink text-right truncate">{value}</dd>
    </div>
  );
}
