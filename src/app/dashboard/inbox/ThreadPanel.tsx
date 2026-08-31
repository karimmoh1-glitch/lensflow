import { requireBusiness } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { ChevronLeft } from "lucide-react";
import { cn, formatMoney } from "@/lib/utils";
import { Composer } from "./Composer";
import { MarkLostButton } from "./MarkLostButton";
import { DeleteConversationButton } from "./DeleteConversationButton";
import { LeadBooking } from "./LeadBooking";
import { scoreLead, scoreLabel } from "@/lib/leadScoring";
import { ChannelBadge, CHANNEL_META } from "@/lib/channelIcons";

export async function ThreadPanel({ conversationId }: { conversationId: string }) {
  const ctx = await requireBusiness();
  if (!ctx) redirect("/login");
  const { business } = ctx;

  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, businessId: business.id },
    include: {
      client: true,
      messages: { orderBy: { createdAt: "asc" } },
      lead: { include: { service: true } },
    },
  });

  if (!conversation) return <div className="flex-1 flex items-center justify-center text-ink/40 text-sm">Conversation not found</div>;

  const lead = conversation.lead;
  const scored = lead
    ? scoreLead({
        intent: lead.intent,
        hasRequestedDate: Boolean(lead.requestedDate || lead.requestedDateText),
        requestedDate: lead.requestedDate,
        serviceValueCents: lead.service?.priceCents ?? lead.estimatedValueCents,
        hoursSinceLastInbound: lead.lastInboundAt ? (Date.now() - lead.lastInboundAt.getTime()) / 3_600_000 : 999,
        hasRespondedYet: Boolean(lead.respondedAt),
        fieldsKnownCount: [lead.extractedName, lead.serviceId, lead.requestedDate, lead.requestedLocation, lead.budgetCents].filter(
          Boolean
        ).length,
      })
    : null;
  const temp = scored ? scoreLabel(scored.score) : null;

  return (
    <div className="flex-1 flex min-w-0">
      <div className="flex-1 flex flex-col min-w-0">
        <div className="px-4 md:px-6 py-3.5 border-b border-border bg-white flex items-center gap-3">
          <Link href="/dashboard/inbox" className="md:hidden -ml-1 w-8 h-8 flex items-center justify-center rounded-md hover:bg-black/[0.05]">
            <ChevronLeft className="w-4.5 h-4.5 text-ink/60" strokeWidth={2} />
          </Link>
          <div className="flex-1 min-w-0">
            <h2 className="font-medium text-sm truncate">{conversation.client?.name ?? conversation.externalHandle ?? "Unknown"}</h2>
            <div className="flex items-center gap-1.5 text-xs text-ink/45 truncate">
              <ChannelBadge channel={conversation.channel} />
              {CHANNEL_META[conversation.channel].label}
              {conversation.externalHandle ? ` · ${conversation.externalHandle}` : ""}
              {conversation.subject ? ` · ${conversation.subject}` : ""}
            </div>
          </div>
          {scored && (
            <span
              className={cn(
                "flex items-center gap-1.5 text-xs font-medium shrink-0",
                temp === "HOT" ? "text-accent-text" : temp === "WARM" ? "text-warning-text" : "text-ink/40"
              )}
            >
              <span className={cn("w-1.5 h-1.5 rounded-full", temp === "HOT" ? "bg-accent" : temp === "WARM" ? "bg-warning" : "bg-ink/25")} />
              {scored.score}/100
            </span>
          )}
          <DeleteConversationButton conversationId={conversation.id} />
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin px-4 md:px-6 py-6 space-y-4">
          {conversation.messages.map((m) => (
            <div key={m.id} className={cn("max-w-md", m.direction === "OUTBOUND" ? "ml-auto" : "")}>
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
              <div className={cn("text-[11px] text-ink/35 mt-1", m.direction === "OUTBOUND" ? "text-right" : "")}>
                {m.status === "FAILED" && <span className="text-danger-text">Failed to send · </span>}
                {m.aiDrafted && "AI drafted · "}
                {format(m.createdAt, "MMM d, h:mm a")}
              </div>
            </div>
          ))}
        </div>

        <Composer conversationId={conversation.id} />
      </div>

      {lead && (
        <div className="hidden lg:block w-72 shrink-0 border-l border-border bg-white px-5 py-5 overflow-y-auto scrollbar-thin">
          <div className="text-xs font-semibold uppercase tracking-wide text-ink/40 mb-3">Lead details</div>
          {(() => {
            const fields = [
              { label: "Name", value: lead.extractedName },
              { label: "Service", value: lead.service?.name ?? null },
              { label: "Requested date", value: lead.requestedDateText },
              { label: "Location", value: lead.requestedLocation },
              { label: "Budget", value: lead.budgetCents ? formatMoney(lead.budgetCents) : null },
              { label: "Estimated value", value: lead.estimatedValueCents ? formatMoney(lead.estimatedValueCents) : null },
            ].filter((f) => f.value);
            if (fields.length === 0 && lead.intent === "UNKNOWN") {
              return <p className="text-xs text-ink/40 italic">Still gathering details from the conversation.</p>;
            }
            return (
              <dl className="space-y-3 text-sm">
                {fields.map((f) => (
                  <Field key={f.label} label={f.label} value={f.value} />
                ))}
                {lead.intent !== "UNKNOWN" && (
                  <div>
                    <dt className="text-xs text-ink/40">Intent</dt>
                    <dd className="mt-0.5">
                      <span
                        className={cn(
                          "inline-block text-xs font-medium px-1.5 py-0.5 rounded",
                          lead.intent === "HIGH"
                            ? "bg-accent-soft text-accent-text"
                            : lead.intent === "MEDIUM"
                              ? "bg-warning-soft text-warning-text"
                              : "bg-black/[0.05] text-ink/55"
                        )}
                      >
                        {lead.intent}
                      </span>
                    </dd>
                  </div>
                )}
              </dl>
            );
          })()}

          {scored && scored.reasons.length > 0 && (
            <>
              <div className="text-xs font-semibold uppercase tracking-wide text-ink/40 mt-6 mb-2">Why this score</div>
              <ul className="space-y-1 text-xs text-ink/55">
                {scored.reasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </>
          )}

          {lead.status !== "BOOKED" && lead.status !== "LOST" && (
            <div className="mt-6 pt-4 border-t border-border space-y-4">
              <LeadBooking leadId={lead.id} hasService={Boolean(lead.service)} />
              <MarkLostButton leadId={lead.id} />
            </div>
          )}
          {lead.status === "BOOKED" && (
            <div className="mt-6 pt-4 border-t border-border">
              <p className="text-xs text-ink/40">This lead already has a booking.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <dt className="text-xs text-ink/40">{label}</dt>
      <dd className={cn("font-medium", !value && "text-ink/30 font-normal italic")}>{value ?? "Unknown"}</dd>
    </div>
  );
}
