import { redirect } from "next/navigation";
import { requireBusiness, homeRouteFor, STAFF_ROLES } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import { Thread, ThreadNode } from "@/components/Thread";
import { cn } from "@/lib/utils";
import { formatDistanceToNowStrict } from "date-fns";
import { AutomationToggle } from "./AutomationToggle";
import { NewAutomationButton, EditAutomationButton } from "./AutomationEditor";
import Link from "next/link";
import { planLimits, effectivePlan, PLANS, limitLabel } from "@/lib/billing";

// Every automation reads as one sentence in three beats — WHEN something happens, IF a
// condition holds, THEN Daythread acts — colored with the same meanings as everywhere
// else: the trigger is a signal (coral), the condition is the system thinking (violet),
// the action is an outcome (green). No node editor; nobody running a business wants one.
const TRIGGER: Record<string, { label: string; timing: "before" | "after" | "at" }> = {
  BOOKING_CREATED: { label: "a booking is created", timing: "at" },
  DAYS_BEFORE_SHOOT: { label: "a booking is coming up", timing: "before" },
  SHOOT_COMPLETED: { label: "a booking is completed", timing: "after" },
  LEAD_INACTIVE: { label: "a lead goes quiet", timing: "after" },
};

const ACTION: Record<string, string> = {
  SEND_CONFIRMATION: "send a confirmation",
  SEND_QUESTIONNAIRE: "send the questionnaire",
  SEND_REMINDER: "send a reminder",
  SEND_THANK_YOU: "send a thank-you",
  SEND_FOLLOW_UP: "send a follow-up",
};

type EditableTrigger = "BOOKING_CREATED" | "DAYS_BEFORE_SHOOT" | "SHOOT_COMPLETED" | "LEAD_INACTIVE";
type EditableAction = "SEND_CONFIRMATION" | "SEND_QUESTIONNAIRE" | "SEND_REMINDER" | "SEND_THANK_YOU" | "SEND_FOLLOW_UP";
/** Payment automations from before Daythread stopped handling customer payments stay readable but can't be edited or created. */
function isEditable(trigger: string, action: string): boolean {
  return trigger in TRIGGER && action in ACTION;
}

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
    prisma.automation.findMany({ where: { businessId: business.id }, orderBy: [{ createdAt: "asc" }, { name: "asc" }] }),
    prisma.automationExecution.findMany({ where: { businessId: business.id }, orderBy: { ranAt: "desc" }, take: 8, include: { automation: true } }),
  ]);

  const limits = planLimits(business);
  const plan = effectivePlan(business);
  const on = automations.filter((a) => a.enabled).length;
  const capped = Number.isFinite(limits.maxAutomations);
  const overCap = capped && on > limits.maxAutomations;
  // Which switched-on automations actually run under a count cap: the oldest N, same rule as the runner.
  const running = new Set(automations.filter((a) => a.enabled).slice(0, capped ? limits.maxAutomations : undefined).map((a) => a.id));

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-8 py-6 md:py-10">
      <PageHeader
        title="Automations"
        description="The repetitive parts of your business, handled while you work."
        action={
          <div className="flex items-center gap-3">
            <span className="hidden sm:inline text-xs font-semibold text-ink/65 tabular-nums">{capped ? `${on} / ${limits.maxAutomations} on` : `${on} on · unlimited`} <span className="text-ink/60">· {PLANS[plan].name}</span></span>
            <NewAutomationButton />
          </div>
        }
      />
      <p className="sm:hidden -mt-4 mb-5 text-xs font-semibold text-ink/65 tabular-nums">{capped ? `${on} / ${limits.maxAutomations} on` : `${on} on · unlimited`} <span className="text-ink/60">· {PLANS[plan].name}</span></p>
      {capped && on >= limits.maxAutomations && !overCap && (
        <div className="mb-5 rounded-2xl border border-signal/25 bg-signal-soft/40 px-4 py-3 text-sm text-ink/80 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span><span className="font-semibold text-ink">Automation limit reached.</span> {PLANS[plan].name} includes {limits.maxAutomations} switched on at once. Turn one off to enable another, or upgrade to Pro for {limitLabel(PLANS.PRO.maxAutomations).toLowerCase()} automations.</span>
          <Link href="/dashboard/settings?tab=subscription" className="text-signal-text font-semibold hover:underline">See plans →</Link>
        </div>
      )}
      {overCap && (
        <div role="alert" className="mb-5 rounded-2xl border border-warning/40 bg-warning-soft/60 px-4 py-3 text-sm text-ink/80">
          <span className="font-semibold text-ink">{on} automations are on; {PLANS[plan].name} runs {limits.maxAutomations}.</span> Nothing was deleted — the {limits.maxAutomations} oldest keep running and the rest are paused (marked below) until you turn some off or upgrade. <Link href="/dashboard/settings?tab=subscription" className="text-signal-text font-semibold hover:underline">See plans →</Link>
        </div>
      )}

      {automations.length === 0 ? (
        <EmptyState
          title="Nothing runs on its own yet"
          description="Confirmations, reminders, thank-yous and follow-ups can send themselves the moment a booking changes or a lead goes quiet. Start from a recipe; every message is yours to edit."
          action={<NewAutomationButton />}
        />
      ) : (
        <div className="space-y-3 mb-10 dt-rows">
          {automations.map((a) => (
            <Card key={a.id} className={cn(!a.enabled && "opacity-60")}>
              <div className="px-5 py-4">
                <div className="flex items-center justify-between gap-4 mb-3">
                  <span className="text-sm font-medium text-ink flex items-center gap-2 min-w-0">
                    <span className="truncate">{a.name}</span>
                    {a.enabled && !running.has(a.id) && <span className="shrink-0 text-[10px] font-bold uppercase tracking-[0.1em] text-warning-text bg-warning-soft rounded-full px-1.5 py-0.5">Paused by plan</span>}
                  </span>
                  <div className="flex items-center gap-2 shrink-0">
                    {isEditable(a.trigger, a.action) ? <EditAutomationButton automation={{ id: a.id, name: a.name, trigger: a.trigger as EditableTrigger, action: a.action as EditableAction, offsetHours: a.offsetHours, messageTemplate: a.messageTemplate }} /> : <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-ink/60">Legacy</span>}
                    <AutomationToggle id={a.id} enabled={a.enabled} name={a.name} />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-2">
                  <Beat label="When" tone="signal" text={TRIGGER[a.trigger]?.label ?? a.trigger.toLowerCase()} />
                  <Arrow />
                  <Beat label="If" tone="thinking" text={condition(a.trigger, a.offsetHours)} />
                  <Arrow />
                  <Beat label="Then" tone="outcome" text={ACTION[a.action] ?? a.action.toLowerCase()} />
                </div>
                <p className="text-xs text-ink/60 mt-3 truncate">
                  <span className="text-ink/60">Sends:</span> “{a.messageTemplate}”
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
                    kind={r.result === "sent" ? "outcome" : r.result === "failed" ? "signal" : r.result === "not_configured" || r.result === "pending" ? "state" : "note"}
                    title={r.automation.name}
                    meta={r.result === "sent" ? `Sent · ${r.targetType}` : r.result === "failed" ? "Failed to send" : r.result === "not_configured" ? "Not delivered — channel not connected" : r.result === "pending" ? "Sending…" : "Skipped"}
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
    <svg width="18" height="12" viewBox="0 0 18 12" fill="none" aria-hidden className="text-ink/25 shrink-0 hidden sm:block">
      <path d="M1 6h14m0 0-4-4m4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
