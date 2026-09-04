import { requireBusiness } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import { format, formatDistanceToNowStrict } from "date-fns";
import { ChevronLeft } from "lucide-react";
import { cn, formatMoney, initials, toZonedDisplayDate } from "@/lib/utils";
import { Thread, ThreadNode } from "@/components/Thread";
import { Composer } from "./Composer";
import { MarkLostButton } from "./MarkLostButton";
import { DeleteConversationButton } from "./DeleteConversationButton";
import { LeadBooking } from "./LeadBooking";
import { scoreLead, scoreLabel } from "@/lib/leadScoring";
import { ChannelBadge, CHANNEL_META } from "@/lib/channelIcons";

/**
 * A message is never just a message. The rail to the right of the conversation answers
 * "who is this, where do we stand, and what should I do" without leaving the thread:
 * the person, their status and value, what's booked and what's paid, and the next step.
 */
export async function ThreadPanel({ conversationId }: { conversationId: string }) {
  const ctx = await requireBusiness();
  if (!ctx) redirect("/login");
  const { business } = ctx;

  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, businessId: business.id },
    include: {
      client: {
        include: {
          bookings: { include: { service: true }, orderBy: { startAt: "desc" }, take: 3 },
          payments: { orderBy: { createdAt: "desc" }, take: 3 },
        },
      },
      messages: { orderBy: { createdAt: "asc" } },
      lead: { include: { service: true } },
    },
  });

  if (!conversation) return <div className="flex-1 flex items-center justify-center text-ink/60 text-sm">Conversation not found</div>;

  const lead = conversation.lead;
  const client = conversation.client;
  const scored = lead
    ? scoreLead({
        intent: lead.intent,
        hasRequestedDate: Boolean(lead.requestedDate || lead.requestedDateText),
        requestedDate: lead.requestedDate,
        serviceValueCents: lead.service?.priceCents ?? lead.estimatedValueCents,
        hoursSinceLastInbound: lead.lastInboundAt ? (Date.now() - lead.lastInboundAt.getTime()) / 3_600_000 : 999,
        hasRespondedYet: Boolean(lead.respondedAt),
        fieldsKnownCount: [lead.extractedName, lead.serviceId, lead.requestedDate, lead.requestedLocation, lead.budgetCents].filter(Boolean).length,
      })
    : null;
  const temp = scored ? scoreLabel(scored.score) : null;
  const needsReply = Boolean(lead && !lead.respondedAt && lead.status !== "BOOKED" && lead.status !== "LOST");
  const displayName = client?.name ?? lead?.extractedName ?? conversation.externalHandle ?? "Unknown";
  const paidCents = client?.payments.filter((p) => p.status === "PAID").reduce((s, p) => s + p.amountCents, 0) ?? 0;
  const returning = (client?.bookings.length ?? 0) > 0;

  const rail = (lead || client) ? (
    <>
          <div className="px-5 pt-5 pb-4 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-accent-soft text-accent-text flex items-center justify-center text-xs font-semibold shrink-0">
                {initials(displayName)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">{displayName}</div>
                <div className="text-xs text-ink/65 truncate">
                  {lead?.status === "BOOKED" ? "Client · booked" : lead?.status === "LOST" ? "Lead · lost" : returning ? "Returning client" : lead ? "New lead" : "Client"}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              {scored && (
                <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium rounded-full px-2 py-0.5", temp === "HOT" ? "bg-accent-soft text-accent-text" : temp === "WARM" ? "bg-warning-soft text-warning-text" : "bg-black/[0.05] text-ink/70")}>
                  <span className={cn("w-1.5 h-1.5 rounded-full", temp === "HOT" ? "bg-accent" : temp === "WARM" ? "bg-warning" : "bg-ink/30")} />
                  {scored.score}/100
                </span>
              )}
              {lead?.estimatedValueCents ? <span className="text-xs font-medium text-ink/75 tabular-nums">{formatMoney(lead.estimatedValueCents)} opportunity</span> : null}
              {paidCents > 0 && <span className="text-xs text-ink/65 tabular-nums">{formatMoney(paidCents)} paid to date</span>}
            </div>
            {client && (
              <Link href={`/dashboard/clients/${client.id}`} className="inline-block mt-3 text-xs font-medium text-accent-text hover:underline">
                Open relationship →
              </Link>
            )}
          </div>

          <div className="px-5 py-4 space-y-5">
            {lead && (lead.service || lead.requestedDateText || lead.requestedLocation || lead.budgetCents) && (
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-ink/60 mb-2">They mentioned</div>
                <dl className="space-y-1.5 text-sm">
                  {lead.service && <Row label="Service" value={lead.service.name} />}
                  {lead.requestedDateText && <Row label="Date" value={lead.requestedDateText} />}
                  {lead.requestedLocation && <Row label="Location" value={lead.requestedLocation} />}
                  {lead.budgetCents ? <Row label="Budget" value={formatMoney(lead.budgetCents)} /> : null}
                </dl>
              </div>
            )}

            {client && (client.bookings.length > 0 || client.payments.length > 0) && (
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-ink/60 mb-1">History</div>
                <Thread>
                  {client.bookings.map((b) => (
                    <ThreadNode
                      key={b.id}
                      kind={b.status === "COMPLETED" || b.status === "BALANCE_PAID" ? "outcome" : b.status === "CANCELED" ? "note" : "state"}
                      title={b.service.name}
                      meta={b.status.replaceAll("_", " ").toLowerCase()}
                      when={format(toZonedDisplayDate(b.startAt, business.timezone), "MMM d")}
                      href={`/dashboard/bookings/${b.id}`}
                    />
                  ))}
                  {client.payments.map((p) => (
                    <ThreadNode
                      key={p.id}
                      kind={p.status === "PAID" ? "outcome" : "state"}
                      title={`${p.purpose === "DEPOSIT" ? "Deposit" : "Balance"} · ${formatMoney(p.amountCents)}`}
                      meta={p.status === "PAID" ? "Paid" : p.status.replaceAll("_", " ").toLowerCase()}
                      when={format(p.confirmedAt ?? p.createdAt, "MMM d")}
                    />
                  ))}
                </Thread>
              </div>
            )}

            {lead && lead.status !== "BOOKED" && lead.status !== "LOST" && (
              <div className="pt-4 border-t border-border space-y-4">
                {needsReply && lead.lastInboundAt && (
                  <p className="text-xs text-ink/65">Waiting {formatDistanceToNowStrict(lead.lastInboundAt)}. Reply below, or book them straight from here.</p>
                )}
                <LeadBooking leadId={lead.id} hasService={Boolean(lead.service)} />
                <MarkLostButton leadId={lead.id} />
              </div>
            )}

            {scored && scored.reasons.length > 0 && (
              <details className="text-xs">
                <summary className="cursor-pointer text-ink/60 hover:text-ink select-none">Why this score</summary>
                <ul className="mt-2 space-y-1 text-ink/75">
                  {scored.reasons.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>

    </>
  ) : null;

  return (
    <div className="flex-1 flex min-w-0">
      <div className="flex-1 flex flex-col min-w-0">
        <div className="px-4 md:px-6 py-3.5 border-b border-border bg-white flex items-center gap-3">
          <Link href="/dashboard/inbox" className="md:hidden -ml-1 w-8 h-8 flex items-center justify-center rounded-md hover:bg-black/[0.05]">
            <ChevronLeft className="w-[18px] h-[18px] text-ink/60" strokeWidth={2} />
          </Link>
          <div className="flex-1 min-w-0">
            <h2 className="font-medium text-sm truncate">{displayName}</h2>
            <div className="flex items-center gap-1.5 text-xs text-ink/65 truncate">
              <ChannelBadge channel={conversation.channel} />
              {CHANNEL_META[conversation.channel].label}
              {conversation.externalHandle ? ` · ${conversation.externalHandle}` : ""}
              {conversation.subject ? ` · ${conversation.subject}` : ""}
            </div>
          </div>
          {needsReply && (
            <span className="hidden sm:inline-flex items-center gap-1.5 text-xs font-medium text-accent-text shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-accent" />
              Needs reply
            </span>
          )}
          <DeleteConversationButton conversationId={conversation.id} />
        </div>

        {rail && (
          <details className="lg:hidden border-b border-border bg-paper/60 group/ctx">
            <summary className="flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-ink/70 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
              <span className="w-1.5 h-1.5 rounded-full bg-signal" />
              About {displayName}
              <span className="ml-auto text-ink/40 transition-transform group-open/ctx:rotate-180" aria-hidden>▾</span>
            </summary>
            <div className="max-h-[52vh] overflow-y-auto scrollbar-thin bg-white border-t border-border">{rail}</div>
          </details>
        )}
        <div className="flex-1 overflow-y-auto scrollbar-thin px-4 md:px-6 py-6 space-y-4">
          {conversation.messages.map((m) => (
            <div key={m.id} className={cn("max-w-md dt-swap", m.direction === "OUTBOUND" ? "ml-auto" : "")}>
              <div
                className={cn(
                  "rounded-2xl px-4 py-2.5 text-sm",
                  m.status === "FAILED"
                    ? "bg-danger-soft text-danger-text rounded-br-sm border border-danger/30"
                    : m.direction === "OUTBOUND"
                      ? "bg-ink text-white rounded-br-sm"
                      : "bg-black/[0.05] text-ink rounded-bl-sm"
                )}
              >
                {m.body}
              </div>
              <div className={cn("text-[11px] text-ink/50 mt-1", m.direction === "OUTBOUND" ? "text-right" : "")}>
                {m.status === "FAILED" && <span className="text-danger-text">Failed to send · </span>}
                {m.aiDrafted && <span className="text-signal-text">AI drafted · </span>}
                {format(m.createdAt, "MMM d, h:mm a")}
              </div>
            </div>
          ))}
        </div>

        <Composer conversationId={conversation.id} />
      </div>

      {rail && (
        <aside className="hidden lg:flex w-80 shrink-0 border-l border-border bg-white flex-col overflow-y-auto scrollbar-thin">
          {rail}
        </aside>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-ink/65 shrink-0">{label}</dt>
      <dd className="font-medium text-right truncate">{value}</dd>
    </div>
  );
}
