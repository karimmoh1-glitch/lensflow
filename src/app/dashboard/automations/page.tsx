import { redirect } from "next/navigation";
import { requireBusiness, homeRouteFor, STAFF_ROLES } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import { Thread, ThreadNode } from "@/components/Thread";
import { cn } from "@/lib/utils";
import { formatDistanceToNowStrict } from "date-fns";
import { AutomationToggle } from "./AutomationToggle";

// Every automation reads as one sentence in three beats — WHEN something happens, IF a
// condition holds, THEN Daythread acts — colored with the same meanings as everywhere
// else: the trigger is a signal (coral), the condition is the system thinking (violet),
// the action is an outcome (green). No node editor; nobody running a business wants one.
const TRIGGER: Record<string, { label: string; timing: "before" | "after" | "at" }> = {
  BOOKING_CREATED: { label: "a booking is created", timing: "at" },
  DEPOSIT_PAID: { label: "a deposit is paid", timing: "at" },
  DAYS_BEFORE_SHOOT: { label: "a booking is coming up", timing: "before" },
  SHOOT_COMPLETED: { label: "a booking is completed", timing: "after" },
  PAYMENT_DUE_SOON: { label: "a payment is due", timing: "before" },
  PAYMENT_OVERDUE: { label: "a payment goes overdue", timing: "at" },
  LEAD_INACTIVE: { label: "a lead goes quiet", timing: "after" },
};

const ACTION: Record<string, string> = {
  SEND_CONFIRMATION: "send a confirmation",
  SEND_QUESTIONNAIRE: "send the questionnaire",
  SEND_REMINDER: "send a reminder",
  SEND_THANK_YOU: "send a thank-you",
  SEND_PAYMENT_REMINDER: "send a payment reminder",
  SEND_FOLLOW_UP: "send a follow-up",
};

function condition(trigger: string, offsetHours: number): string {
  const t = TRIGGER[trigger];
  if (!t || offsetHours === 0) return "right away";
  const span = offsetHours % 24 === 0 ? `${offsetHours / 24} day${offsetHours === 24 ? "" : "s"}` : `${offsetHours} hours`;
  return t.timing === "before" ? `${span} before` : `${span} after`;
}

export default async function AutomationsPage() {
  const ctx = await requireBusiness();
  if (!ctx) redirect("/login");
  if (!STAFF_ROLES.includes(ctx.role)) redirect(homeRouteFor(ctx.role, ctx.business));
  const { business } = ctx;

  const [automations, recentRuns] = await Promise.all([
    prisma.automation.findMany({ where: { businessId: business.id }, orderBy: { createdAt: "asc" } }),
    prisma.automationExecution.findMany({ where: { businessId: business.id }, orderBy: { ranAt: "desc" }, take: 8, include: { automation: true } }),
  ]);

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-8 py-6 md:py-10">
      <PageHeader title="Automations" description="The repetitive parts of your business, handled while you work." />

      {automations.length === 0 ? (
        <EmptyState
          title="No automations yet"
          description="Confirmations, reminders, and follow-ups can send themselves the moment a booking or payment changes."
        />
      ) : (
        <div className="space-y-3 mb-10">
          {automations.map((a) => (
            <Card key={a.id} className={cn(!a.enabled && "opacity-60")}>
              <div className="px-5 py-4">
                <div className="flex items-center justify-between gap-4 mb-3">
                  <span className="text-sm font-medium text-ink">{a.name}</span>
                  <AutomationToggle id={a.id} enabled={a.enabled} />
                </div>
                <div className="grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-2">
                  <Beat label="When" tone="signal" text={TRIGGER[a.trigger]?.label ?? a.trigger.toLowerCase()} />
                  <Arrow />
                  <Beat label="If" tone="thinking" text={condition(a.trigger, a.offsetHours)} />
                  <Arrow />
                  <Beat label="Then" tone="outcome" text={ACTION[a.action] ?? a.action.toLowerCase()} />
                </div>
                <p className="text-xs text-ink/60 mt-3 truncate">
                  <span className="text-ink/45">Sends:</span> “{a.messageTemplate}”
                </p>
              </div>
            </Card>
          ))}
        </div>
      )}

      {recentRuns.length > 0 && (
        <>
          <h2 className="text-sm font-medium text-ink mb-2.5">Recently ran</h2>
          <Card>
            <div className="px-5 py-2">
              <Thread>
                {recentRuns.map((r) => (
                  <ThreadNode
                    key={r.id}
                    kind={r.result === "sent" ? "outcome" : r.result === "failed" ? "signal" : "note"}
                    title={r.automation.name}
                    meta={r.result === "sent" ? `Sent · ${r.targetType}` : r.result === "failed" ? "Failed to send" : "Skipped"}
                    when={formatDistanceToNowStrict(r.ranAt, { addSuffix: true })}
                  />
                ))}
              </Thread>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

const BEAT: Record<"signal" | "thinking" | "outcome", { dot: string; label: string; bg: string }> = {
  signal: { dot: "bg-accent", label: "text-accent-text", bg: "bg-accent-soft/50" },
  thinking: { dot: "bg-signal", label: "text-signal-text", bg: "bg-signal-soft/60" },
  outcome: { dot: "bg-success", label: "text-success-text", bg: "bg-success-soft/60" },
};

function Beat({ label, tone, text }: { label: string; tone: keyof typeof BEAT; text: string }) {
  const t = BEAT[tone];
  return (
    <div className={cn("rounded-xl px-3 py-2.5 min-w-0", t.bg)}>
      <div className={cn("flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide mb-0.5", t.label)}>
        <span className={cn("w-1.5 h-1.5 rounded-full", t.dot)} />
        {label}
      </div>
      <div className="text-sm text-ink truncate">{text}</div>
    </div>
  );
}

function Arrow() {
  return (
    <svg width="18" height="12" viewBox="0 0 18 12" fill="none" aria-hidden className="text-ink/25 shrink-0">
      <path d="M1 6h14m0 0-4-4m4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
