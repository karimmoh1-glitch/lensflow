import { redirect, notFound } from "next/navigation";
import { requireBusiness, homeRouteFor, STAFF_ROLES } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Card, CardBody, Badge, EmptyState } from "@/components/ui";
import { Thread, ThreadNode, NextAction, type ThreadKind } from "@/components/Thread";
import { formatMoney, initials, toZonedDisplayDate } from "@/lib/utils";
import { CHANNEL_META } from "@/lib/channelIcons";
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
      conversations: { include: { messages: { orderBy: { createdAt: "desc" }, take: 1 } } },
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
  const waitingConv = waitingLead?.conversationId ? client.conversations.find((c) => c.id === waitingLead.conversationId) : undefined;
  const nextBooking = [...client.bookings].filter((b) => b.status !== "CANCELED" && isFuture(b.startAt)).sort((a, b) => a.startAt.getTime() - b.startAt.getTime())[0];
  const owed = client.payments.find((p) => p.status !== "PAID");

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
          <h1 className="font-display text-2xl truncate">{client.name}</h1>
          <p className="text-sm text-ink/70 truncate">{[client.email, client.phone, client.instagram].filter(Boolean).join(" · ") || "No contact info yet"}</p>
        </div>
        <div className="ml-auto text-right shrink-0">
          <div className="text-xs text-ink/60">Lifetime</div>
          <div className="font-display text-2xl tabular-nums">{formatMoney(ltv)}</div>
          {outstanding > 0 && <div className="text-xs text-warning-text tabular-nums">{formatMoney(outstanding)} owed</div>}
        </div>
      </div>

      {waitingLead && (
        <div className="mb-6">
          <NextAction
            title={`Reply to ${client.name.split(" ")[0]}`}
            why={waitingLead.lastInboundAt ? `Waiting ${formatDistanceToNowStrict(waitingLead.lastInboundAt)}${waitingLead.estimatedValueCents ? ` · ${formatMoney(waitingLead.estimatedValueCents)} opportunity` : ""}` : "New inquiry"}
            href={waitingConv ? `/dashboard/inbox?c=${waitingConv.id}` : "/dashboard/inbox"}
            cta="Reply"
          />
        </div>
      )}
      {!waitingLead && nextBooking && (
        <div className="mb-6">
          <NextAction
            title={`${nextBooking.service.name} · ${format(toZonedDisplayDate(nextBooking.startAt, tz), "EEE, MMM d · h:mm a")}`}
            why={nextBooking.status === "BOOKED" ? "Not confirmed yet" : "Up next"}
            href={`/dashboard/bookings/${nextBooking.id}`}
            cta="Open"
          />
        </div>
      )}
      {!waitingLead && !nextBooking && owed && (
        <div className="mb-6">
          <NextAction title={`Collect ${formatMoney(owed.amountCents)}`} why={`${owed.purpose === "DEPOSIT" ? "Deposit" : "Balance"} still outstanding`} href="/dashboard/payments" cta="Payments" />
        </div>
      )}

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
