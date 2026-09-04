import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { requireBusiness, homeRouteFor, STAFF_ROLES } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Card, CardBody, Badge, EmptyState } from "@/components/ui";
import { Thread, ThreadNode, NextAction, type ThreadKind } from "@/components/Thread";
import { formatMoney, initials, toZonedDisplayDate, cn } from "@/lib/utils";
import { CHANNEL_META } from "@/lib/channelIcons";
import { readRelationship, humanAgo } from "@/lib/relationshipState";
import { RelationshipControls } from "./RelationshipControls";
import { format, formatDistanceToNowStrict, isFuture } from "date-fns";
import { NoteForm } from "./NoteForm";

type Event = { when: Date; kind: ThreadKind; title: string; meta?: string; href?: string };

/**
 * A client is not a database row; it's a relationship with a history. This page is that
 * history as one thread — every conversation, booking, payment and note in the order it
 * actually happened — with the single most useful next step lifted to the top.
 */
export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireBusiness();
  if (!ctx) redirect("/login");
  if (!STAFF_ROLES.includes(ctx.role)) redirect(homeRouteFor(ctx.role, ctx.business));
  const { business } = ctx;
  const { id } = await params;

  const client = await prisma.client.findFirst({
    where: { id, businessId: business.id },
    include: {
      bookings: { include: { service: true }, orderBy: { startAt: "desc" } },
      payments: { orderBy: { createdAt: "desc" } },
      conversations: { include: { messages: { orderBy: { createdAt: "desc" }, take: 30 } } },
      notes: { orderBy: { createdAt: "desc" }, include: { author: true } },
      subscriptions: { include: { plan: true } },
      leads: true,
      referrals: true,
    },
  });
  if (!client) notFound();

  const tz = business.timezone;
  const ltv = client.payments.filter((p) => p.status === "PAID").reduce((s, p) => s + p.amountCents, 0);
  const outstanding = client.payments.filter((p) => p.status !== "PAID").reduce((s, p) => s + p.amountCents, 0);

  // The one thing: someone waiting beats an upcoming date beats money owed.
  const waitingLead = client.leads.find((l) => !l.respondedAt && l.status !== "BOOKED" && l.status !== "LOST");
  const firstConversation = [...client.conversations].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];
  const waitingConv = waitingLead?.conversationId ? client.conversations.find((c) => c.id === waitingLead.conversationId) : undefined;
  const nextBooking = [...client.bookings].filter((b) => b.status !== "CANCELED" && isFuture(b.startAt)).sort((a, b) => a.startAt.getTime() - b.startAt.getTime())[0];
  const owed = client.payments.find((p) => p.status !== "PAID");

  // Where we stand — derived from what actually happened, never a pipeline stage.
  const now = new Date();
  const allMessages = client.conversations.flatMap((c) => c.messages.map((m) => ({ ...m, conversationId: c.id })));
  const lastInbound = allMessages.filter((m) => m.direction === "INBOUND").sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null;
  const lastOutbound = allMessages.filter((m) => m.direction === "OUTBOUND").sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null;
  const lastCompleted = [...client.bookings].filter((b) => b.status !== "CANCELED" && !isFuture(b.startAt)).sort((a, b) => b.startAt.getTime() - a.startAt.getTime())[0];
  const latestLead = [...client.leads].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  const standing = readRelationship({
    relationship: client.relationship,
    lead: latestLead ? { status: latestLead.status, respondedAt: latestLead.respondedAt, lastInboundAt: latestLead.lastInboundAt, createdAt: latestLead.createdAt, hasService: Boolean(latestLead.serviceId), hasDate: Boolean(latestLead.requestedDateText || latestLead.requestedDate) } : null,
    lastInbound: lastInbound?.createdAt ?? null,
    lastOutbound: lastOutbound?.createdAt ?? null,
    lastOutboundWasProposal: Boolean(lastOutbound && /\$\d|\/book\//i.test(lastOutbound.body)),
    upcomingBooking: nextBooking ? { startAt: nextBooking.startAt, label: `${nextBooking.service.name} · ${format(toZonedDisplayDate(nextBooking.startAt, tz), "EEE, MMM d · h:mm a")}`, status: nextBooking.status } : null,
    lastCompletedBooking: lastCompleted ? { startAt: lastCompleted.startAt, label: lastCompleted.service.name } : null,
    outstandingCents: outstanding,
    paidCents: ltv,
    now,
  });
  const lastInteraction = [lastInbound && { when: lastInbound.createdAt, text: `${client.name.split(" ")[0]} wrote to you`, href: `/dashboard/inbox?c=${lastInbound.conversationId}` }, lastOutbound && { when: lastOutbound.createdAt, text: `You replied to ${client.name.split(" ")[0]}`, href: `/dashboard/inbox?c=${lastOutbound.conversationId}` }, ...client.payments.filter((p) => p.status === "PAID").map((p) => ({ when: p.confirmedAt ?? p.createdAt, text: `${client.name.split(" ")[0]} paid ${formatMoney(p.amountCents)}`, href: "/dashboard/payments" }))]
    .filter((x): x is { when: Date; text: string; href: string } => Boolean(x))
    .sort((a, b) => b.when.getTime() - a.when.getTime())[0];
  const standingHref = standing.nextAction
    ? standing.nextAction.label.startsWith("Collect")
      ? "/dashboard/payments"
      : standing.nextAction.label.startsWith("Confirm") && nextBooking
        ? `/dashboard/bookings/${nextBooking.id}`
        : waitingConv
          ? `/dashboard/inbox?c=${waitingConv.id}`
          : lastInbound
            ? `/dashboard/inbox?c=${lastInbound.conversationId}`
            : client.conversations[0]
              ? `/dashboard/inbox?c=${client.conversations[0].id}`
              : "/dashboard/inbox"
    : null;

  const events: Event[] = [
    ...client.conversations.map((c) => ({
      when: c.lastMessageAt,
      kind: (client.leads.some((l) => l.conversationId === c.id && !l.respondedAt) ? "signal" : "state") as ThreadKind,
      title: `Conversation on ${CHANNEL_META[c.channel].label}`,
      meta: c.messages[0]?.body,
      href: `/dashboard/inbox?c=${c.id}`,
    })),
    ...client.bookings.map((b) => ({
      when: b.startAt,
      kind: (b.status === "COMPLETED" || b.status === "BALANCE_PAID" ? "outcome" : b.status === "CANCELED" ? "note" : "state") as ThreadKind,
      title: b.service.name,
      meta: `${b.status.replaceAll("_", " ").toLowerCase()} · ${format(toZonedDisplayDate(b.startAt, tz), "EEE, MMM d · h:mm a")}`,
      href: `/dashboard/bookings/${b.id}`,
    })),
    ...client.payments.map((p) => ({
      when: p.confirmedAt ?? p.createdAt,
      kind: (p.status === "PAID" ? "outcome" : "state") as ThreadKind,
      title: `${p.purpose === "DEPOSIT" ? "Deposit" : "Balance"} · ${formatMoney(p.amountCents)}`,
      meta: p.status === "PAID" ? "Paid" : p.status.replaceAll("_", " ").toLowerCase(),
    })),
    ...client.notes.map((n) => ({
      when: n.createdAt,
      kind: "thinking" as ThreadKind,
      title: n.body,
      meta: `Note · ${n.author?.name ?? "Team"}`,
    })),
  ].sort((a, b) => b.when.getTime() - a.when.getTime());

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-8 py-6 md:py-10">
      <div className="flex items-center gap-4 mb-6">
        <div className="w-14 h-14 rounded-full bg-accent-soft text-accent-text flex items-center justify-center text-lg font-semibold shrink-0">
          {initials(client.name)}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <h1 className="font-display text-2xl truncate">{client.name}</h1>
            <span className={cn("text-[10px] font-bold rounded-full px-2 py-0.5 shrink-0", client.relationship === "CUSTOMER" ? "bg-success-soft text-success-text" : client.relationship === "CONTACT" ? "bg-black/[0.05] text-ink/60" : "bg-signal-soft text-signal-text")}>
              {client.relationship === "CUSTOMER" ? "Customer" : client.relationship === "CONTACT" ? "Contact" : "Potential client"}
            </span>
          </div>
          <p className="text-sm text-ink/70 truncate">{[client.email, client.phone, client.instagram].filter(Boolean).join(" · ") || "No contact info yet"}</p>

        </div>
        <div className="ml-auto text-right shrink-0">
          <div className="text-xs text-ink/60">Lifetime</div>
          <div className="font-display text-2xl tabular-nums">{formatMoney(ltv)}</div>
          {outstanding > 0 && <div className="text-xs text-warning-text tabular-nums">{formatMoney(outstanding)} owed</div>}
        </div>
      </div>

      {/* WHO IS THIS — the relationship, first. */}
      <section aria-label="Where we stand" className="mb-8 rounded-[22px] border border-border bg-white overflow-hidden">
        <div className="grid grid-cols-1 md:grid-cols-[1.2fr_1fr] divide-y md:divide-y-0 md:divide-x divide-border">
          <div className="px-5 md:px-6 py-5">
            <div className="flex items-center gap-2">
              <span className={cn("w-2 h-2 rounded-full", standing.tone === "signal" ? "bg-accent" : standing.tone === "outcome" ? "bg-success" : standing.tone === "warning" ? "bg-warning" : standing.tone === "thinking" ? "bg-signal" : "bg-ink/30")} />
              <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink/45">Where we stand</span>
              <span className={cn("ml-auto text-[10px] font-bold rounded-full px-2 py-0.5", standing.tone === "signal" ? "bg-accent-soft text-accent-text" : standing.tone === "outcome" ? "bg-success-soft text-success-text" : standing.tone === "warning" ? "bg-warning-soft text-warning-text" : standing.tone === "thinking" ? "bg-signal-soft text-signal-text" : "bg-black/[0.05] text-ink/60")}>{standing.label}</span>
            </div>
            <p className="mt-2 font-sans font-extrabold text-[1.35rem] leading-tight tracking-[-0.02em] text-ink">{standing.standing}</p>
            {(standing.theyWaitFor || standing.youWaitFor) && (
              <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
                {standing.theyWaitFor && <div><dt className="inline text-ink/45">They&rsquo;re waiting for </dt><dd className="inline font-semibold text-accent-text">{standing.theyWaitFor}</dd></div>}
                {standing.youWaitFor && <div><dt className="inline text-ink/45">You&rsquo;re waiting for </dt><dd className="inline font-semibold text-ink">{standing.youWaitFor}</dd></div>}
              </dl>
            )}
            {lastInteraction && (
              <p className="mt-3 text-sm text-ink/60">
                <span className="text-ink/45">Last interaction</span> · {humanAgo(lastInteraction.when, now)} ·{" "}
                <Link href={lastInteraction.href} className="text-ink hover:underline">{lastInteraction.text}</Link>
              </p>
            )}
            {standing.nextAction && standingHref && (
              <Link href={standingHref} className="mt-4 inline-flex items-center gap-2 h-10 px-4 rounded-full bg-accent text-white text-sm font-extrabold transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50">
                {standing.nextAction.label}
                <span className="text-white/60 font-medium text-xs">· {standing.nextAction.why}</span>
              </Link>
            )}
          </div>
          <dl className="px-5 md:px-6 py-5 grid grid-cols-2 gap-x-4 gap-y-4 content-start">
            <div>
              <dt className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink/45">Upcoming</dt>
              <dd className="mt-1 text-sm font-semibold text-ink">{nextBooking ? <Link href={`/dashboard/bookings/${nextBooking.id}`} className="hover:underline">{nextBooking.service.name} · {format(toZonedDisplayDate(nextBooking.startAt, tz), "MMM d")}</Link> : <span className="text-ink/45 font-medium">Nothing booked</span>}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink/45">Value</dt>
              <dd className="mt-1 text-sm font-semibold text-ink tabular-nums">{formatMoney(ltv)}{outstanding > 0 && <span className="text-warning-text font-medium"> · {formatMoney(outstanding)} owed</span>}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink/45">Bookings</dt>
              <dd className="mt-1 text-sm font-semibold text-ink tabular-nums">{client.bookings.filter((b) => b.status !== "CANCELED").length}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink/45">Came in via</dt>
              <dd className="mt-1 text-sm font-semibold text-ink">{firstConversation ? `${CHANNEL_META[firstConversation.channel].label} · ${format(firstConversation.createdAt, "MMM yyyy")}` : <span className="text-ink/45 font-medium">Added by you</span>}</dd>
            </div>
            <div className="col-span-2 pt-1">
              <RelationshipControls clientId={client.id} relationship={client.relationship} name={client.name} />
            </div>
          </dl>
        </div>
      </section>

      <div className="grid lg:grid-cols-[1fr_280px] gap-8 items-start">
        <section className="min-w-0">
          <h2 className="text-sm font-medium text-ink mb-3">Relationship</h2>
          {events.length === 0 ? (
            <EmptyState
              title="Nothing on the thread yet"
              description="Every conversation, booking, payment and note with this client will build up here, in order."
            />
          ) : (
            <Card>
              <CardBody className="py-2">
                <Thread>
                  {events.map((e, i) => (
                    <ThreadNode key={i} kind={e.kind} title={e.title} meta={e.meta} when={format(e.when, "MMM d")} href={e.href} />
                  ))}
                </Thread>
              </CardBody>
            </Card>
          )}

          <div className="mt-6">
            <NoteForm clientId={client.id} />
          </div>
        </section>

        <aside className="space-y-4">
          {client.subscriptions.length > 0 && (
            <Card>
              <CardBody>
                <div className="text-xs font-semibold uppercase tracking-wide text-ink/60 mb-2">Membership</div>
                {client.subscriptions.map((s) => (
                  <div key={s.id} className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{s.plan.name}</div>
                      <div className="text-xs text-ink/65">
                        {s.sessionsRemaining} session{s.sessionsRemaining !== 1 && "s"} left · renews {format(s.currentPeriodEnd, "MMM d")}
                      </div>
                    </div>
                    <Badge tone={s.status === "ACTIVE" ? "success" : "warning"}>{s.status.toLowerCase()}</Badge>
                  </div>
                ))}
              </CardBody>
            </Card>
          )}
          <Card>
            <CardBody>
              <div className="text-xs font-semibold uppercase tracking-wide text-ink/60 mb-2">At a glance</div>
              <dl className="space-y-1.5 text-sm">
                <div className="flex justify-between"><dt className="text-ink/65">Bookings</dt><dd className="font-medium tabular-nums">{client.bookings.length}</dd></div>
                <div className="flex justify-between"><dt className="text-ink/65">Conversations</dt><dd className="font-medium tabular-nums">{client.conversations.length}</dd></div>
                <div className="flex justify-between"><dt className="text-ink/65">Client since</dt><dd className="font-medium">{format(client.createdAt, "MMM yyyy")}</dd></div>
              </dl>
            </CardBody>
          </Card>
          {client.referrals.length > 0 && (
            <Card>
              <CardBody>
                <div className="text-xs font-semibold uppercase tracking-wide text-ink/60 mb-2">Referred</div>
                {client.referrals.map((r) => (
                  <div key={r.id} className="text-sm">{r.name}</div>
                ))}
              </CardBody>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}
