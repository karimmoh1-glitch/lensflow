import { requireBusiness } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import { format, formatDistanceToNowStrict, differenceInMinutes } from "date-fns";
import { ChevronLeft, Mail, Phone, AtSign, CalendarDays } from "lucide-react";
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
import { splitMessage } from "@/lib/cleanMessage";
import { understand } from "@/lib/understand";
import { readRelationship } from "@/lib/relationshipState";
import { labelFor } from "@/lib/classifyMessage";
import { leadAttention } from "@/lib/attention";
import { FollowUpControl } from "./FollowUpControl";
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
  const waitingOnYou = isPerson && lastMsg?.direction === "INBOUND";
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
    lead.requestedLocation ? { label: "Location", value: lead.requestedLocation } : null,
    lead.budgetCents ? { label: "Budget", value: `$${(lead.budgetCents / 100).toLocaleString()}` } : null,
  ].filter((x): x is NonNullable<typeof x> => x !== null) : [];

  const rail = (
    <>
      <div className="px-5 pt-5 pb-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className={cn("w-10 h-10 rounded-full flex items-center justify-center text-xs font-semibold shrink-0", isPerson ? "bg-accent-soft text-accent-text" : "bg-black/[0.05] text-ink/65")}>{initials(displayName)}</div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold truncate">{displayName}</div>
            <div className="text-xs text-ink/70 truncate">{relationshipLabel}{relationship ? ` · ${relationship.label}` : ""}</div>
          </div>
        </div>
        {relationship && (
          <p className="mt-2.5 text-xs text-ink/70 leading-snug">
            <span className={cn("inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle", relationship.tone === "signal" ? "bg-accent" : relationship.tone === "outcome" ? "bg-success" : relationship.tone === "warning" ? "bg-warning" : relationship.tone === "thinking" ? "bg-signal" : "bg-ink/30")} />
            {relationship.standing}
          </p>
        )}
        {contact.length > 0 && (
          <ul className="mt-3 space-y-1">
            {contact.map((c) => (
              <li key={c.value}>
                <a href={c.href} target={c.href.startsWith("http") ? "_blank" : undefined} rel="noreferrer" className="inline-flex items-center gap-2 text-xs text-ink/70 hover:text-ink max-w-full">
                  <c.icon className="w-3.5 h-3.5 text-ink/65 shrink-0" strokeWidth={2} aria-hidden />
                  <span className="truncate">{c.value}</span>
                </a>
              </li>
            ))}
          </ul>
        )}
        {!isPerson && conversation.categoryReason && <p className="mt-2.5 text-xs text-ink/65">{conversation.categoryReason}</p>}
        {client && (
          <Link href={`/dashboard/clients/${client.id}`} className="inline-block mt-3 text-xs font-medium text-accent-text hover:underline">Open their history →</Link>
        )}
      </div>

      <div className="px-5 py-4 space-y-4">
        {understanding && (
          <UnderstandingCard
            u={understanding}
            who={displayName}
            relationshipLabel={relationshipLabel}
            quote={latestText.replace(/\s+/g, " ").slice(0, 160)}
            bookingId={upcoming?.id ?? null}
            bookingHref={upcoming ? `/dashboard/bookings/${upcoming.id}` : null}
            bookingPageUrl={`${appUrl}/book/${business.handle}`}
            hasService={Boolean(lead?.service)}
          />
        )}

        {upcoming && (
          <Link href={`/dashboard/bookings/${upcoming.id}`} className="flex items-center gap-3 rounded-2xl border border-success/25 bg-success-soft/40 px-3.5 py-3 hover:bg-success-soft/70 transition-colors">
            <span className="w-8 h-8 rounded-xl bg-white text-success-text flex items-center justify-center shrink-0"><CalendarDays className="w-4 h-4" strokeWidth={2} aria-hidden /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] font-bold uppercase tracking-[0.12em] text-success-text">On the calendar</span>
              <span className="block text-sm font-semibold text-ink truncate">{upcomingLabel}</span>
              {upcoming.status === "BOOKED" && <span className="block text-[11px] text-warning-text font-semibold">Not confirmed yet</span>}
            </span>
          </Link>
        )}

        {isPerson && <SummaryCard conversationId={conversation.id} initial={cachedSummary} autoRun={autoSummarize} />}

        {facts.length > 0 && (
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-ink/65 mb-2">They mentioned</div>
            <dl className="space-y-1.5 text-sm">{facts.map((f) => <Row key={f.label} label={f.label} value={f.value} />)}</dl>
          </div>
        )}

        {lead && lead.status !== "BOOKED" && lead.status !== "LOST" && (
          <div className="pt-4 border-t border-border space-y-3">
            {attention && (
              <p className="rounded-xl bg-paper border border-border px-3 py-2 text-xs text-ink/80"><span className="font-bold text-ink">{attention.label}.</span> {attention.why}</p>
            )}
            <FollowUpControl leadId={lead.id} followUpAt={lead.followUpAt ? lead.followUpAt.toISOString() : null} />
          </div>
        )}

        {canBook && lead && (
          <div id="book-from-here" className="pt-4 border-t border-border space-y-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-ink/65">Book them from here</div>
            {waitingOnYou && lastInboundMsg && <p className="text-xs text-ink/70" suppressHydrationWarning>Waiting {formatDistanceToNowStrict(lastInboundMsg.createdAt)}. Reply below, or put a time on the calendar.</p>}
            <LeadBooking leadId={lead.id} serviceId={lead.service?.id ?? null} services={services} timezone={tz} />
            <MarkLostButton leadId={lead.id} />
          </div>
        )}

        {client && client.bookings.length > 0 && (
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-ink/65 mb-2">Bookings</div>
            <ul className="space-y-1.5">
              {client.bookings.slice(0, 4).map((b) => (
                <li key={b.id}>
                  <Link href={`/dashboard/bookings/${b.id}`} className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 -mx-2 hover:bg-black/[0.03]">
                    <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", b.status === "CANCELED" ? "bg-ink/25" : b.status === "COMPLETED" || b.status === "FOLLOWED_UP" ? "bg-success" : b.status === "BOOKED" ? "bg-warning" : "bg-accent")} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-semibold text-ink truncate">{b.service.name}</span>
                      <span className="block text-[11px] text-ink/70">{b.status.replaceAll("_", " ").toLowerCase()}</span>
                    </span>
                    <span className="text-[11px] text-ink/65 shrink-0">{format(toZonedDisplayDate(b.startAt, tz), "MMM d")}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        {handled.length > 0 && (
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-ink/65 mb-1.5">Daythread sent for you</div>
            <ul className="space-y-1 text-xs text-ink/70">
              {handled.map((h) => (
                <li key={h.id} className="flex items-start gap-2">
                  <span className={cn("mt-[5px] w-1.5 h-1.5 rounded-full shrink-0", h.result === "sent" ? "bg-success" : h.result === "failed" ? "bg-accent" : "bg-ink/30")} />
                  <span>{h.result === "sent" ? "Sent" : h.result === "not_configured" ? "Tried to send" : h.result === "failed" ? "Failed to send" : h.result === "pending" ? "Sending" : "Skipped"} {h.automation.name.toLowerCase()} · {format(h.ranAt, "MMM d")}{h.result === "not_configured" && <span className="text-warning-text"> — channel not connected</span>}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {client && client.conversations.length > 0 && (
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-ink/65 mb-2">Previous conversations</div>
            <ul className="space-y-1.5">
              {client.conversations.map((c) => (
                <li key={c.id}>
                  <Link href={`/dashboard/inbox?c=${c.id}`} className="flex items-start gap-2 rounded-xl px-2 py-1.5 -mx-2 hover:bg-black/[0.03]">
                    <ChannelBadge channel={c.channel} className="mt-0.5" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-semibold text-ink truncate">{c.subject ?? CHANNEL_META[c.channel].label}</span>
                      <span className="block text-[11px] text-ink/70 truncate">{splitMessage(c.messages[0]?.body ?? "").text.slice(0, 80)}</span>
                    </span>
                    <span className="text-[11px] text-ink/65 shrink-0">{format(toZonedDisplayDate(c.lastMessageAt, tz), "MMM d")}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </>
  );

  return (
    <div className="flex-1 flex min-w-0 min-h-0 h-full">
      <MarkReadOnOpen conversationId={conversation.id} unread={unread} />
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <div className="px-3 md:px-6 py-2.5 md:py-3 border-b border-border bg-white flex items-center gap-2 md:gap-3 pt-[max(0.625rem,env(safe-area-inset-top))] md:pt-3">
          <Link href={backHref} className="lg:hidden -ml-1 w-10 h-10 flex items-center justify-center rounded-lg hover:bg-black/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50" aria-label="Back to inbox">
            <ChevronLeft className="w-5 h-5 text-ink/65" strokeWidth={2} />
          </Link>
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-sm truncate">{displayName}</h2>
            <h1 className="sr-only">Conversation with {displayName}</h1>
            <div className="flex items-center gap-1.5 text-xs text-ink/70 truncate">
              <ChannelBadge channel={conversation.channel} />
              {CHANNEL_META[conversation.channel].label}
              {conversation.externalHandle ? ` · ${conversation.externalHandle}` : ""}
              {conversation.subject ? ` · ${conversation.subject}` : ""}
            </div>
          </div>
          {waitingOnYou && (
            <span className="hidden 2xl:inline-flex items-center gap-1.5 text-xs font-medium text-accent-text shrink-0"><span className="w-1.5 h-1.5 rounded-full bg-accent" />Waiting on you</span>
          )}
          {team && <AssignMenu conversationId={conversation.id} members={members.map((m) => ({ membershipId: m.id, name: m.user.name, role: m.role }))} current={conversation.assigneeMembershipId} />}
          <ConversationTools conversationId={conversation.id} unread={unread} category={conversation.category} clientId={client?.id ?? null} relationship={client?.relationship ?? null} variant="header" />
        </div>

        <details className="xl:hidden border-b border-border bg-paper/60 group/ctx">
          <summary className="flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-ink/70 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden min-h-[44px]">
            <span className="w-1.5 h-1.5 rounded-full bg-signal" />
            About {displayName}
            {understanding && <span className="ml-1 text-ink/65 font-medium truncate">· {understanding.nextAction.label}</span>}
            <span className="ml-auto text-ink/65 transition-transform group-open/ctx:rotate-180" aria-hidden>▾</span>
          </summary>
          <div className="max-h-[60vh] overflow-y-auto scrollbar-thin bg-white border-t border-border">{rail}</div>
        </details>

        <div className="flex-1 overflow-y-auto scrollbar-thin px-4 md:px-6 py-6 space-y-3 overscroll-contain bg-[linear-gradient(180deg,rgba(250,250,249,0.6),#fff_120px)]">
          {conversation.messages.map((m, i) => {
            const prev = conversation.messages[i - 1];
            const newDay = !prev || toZonedDisplayDate(prev.createdAt, tz).toDateString() !== toZonedDisplayDate(m.createdAt, tz).toDateString();
            return (
              <div key={m.id} className="space-y-3">
                {newDay && (
                  <div className="flex items-center gap-3 py-1" aria-hidden>
                    <span className="flex-1 h-px bg-border" />
                    <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink/65">{format(toZonedDisplayDate(m.createdAt, tz), "EEE, MMM d")}</span>
                    <span className="flex-1 h-px bg-border" />
                  </div>
                )}
                <MessageBubble
                  direction={m.direction}
                  status={m.status}
                  arrive={i >= conversation.messages.length - 2}
                  meta={
                    <>
                      {m.status === "FAILED" && <span className="text-danger-text">Failed to send · </span>}
                      {m.status === "NOT_DELIVERED" && <span className="text-warning-text">Not delivered — {CHANNEL_META[conversation.channel].label} isn&rsquo;t connected · </span>}
                      {m.status === "DELIVERED" && m.direction === "OUTBOUND" && <span className="text-success-text">Delivered · </span>}
                      {m.aiDrafted && <span className="text-signal-text">AI drafted · </span>}
                      {m.direction === "OUTBOUND" && !m.sentByUserId && !m.aiDrafted && <span className="text-signal-text">Sent by Daythread · </span>}
                      <time dateTime={m.createdAt.toISOString()}>{format(toZonedDisplayDate(m.createdAt, tz), "h:mm a")}</time>
                    </>
                  }
                >
                  <MessageBody body={m.body} outbound={m.direction === "OUTBOUND"} />
                </MessageBubble>
              </div>
            );
          })}
        </div>

        <Composer conversationId={conversation.id} windowNotice={windowNotice} channelLabel={CHANNEL_META[conversation.channel].label} />
      </div>

      <aside className="hidden xl:flex w-80 2xl:w-[22rem] shrink-0 border-l border-border bg-white flex-col overflow-y-auto scrollbar-thin" aria-label={`About ${displayName}`}>{rail}</aside>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-ink/70 shrink-0">{label}</dt>
      <dd className="font-medium text-right truncate">{value}</dd>
    </div>
  );
}
