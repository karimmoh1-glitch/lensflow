import { redirect } from "next/navigation";
import { requireBusiness, homeRouteFor, STAFF_ROLES } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHeader, Card, Badge } from "@/components/ui";
import { AutomationToggle } from "./AutomationToggle";

const TRIGGER_LABEL: Record<string, string> = {
  BOOKING_CREATED: "When a booking is created",
  DEPOSIT_PAID: "When a deposit is paid",
  DAYS_BEFORE_SHOOT: "Before the booking",
  SHOOT_COMPLETED: "After the booking",
  PAYMENT_DUE_SOON: "Before a payment is due",
  PAYMENT_OVERDUE: "When a payment is overdue",
  LEAD_INACTIVE: "When a lead goes quiet",
};

const ACTION_LABEL: Record<string, string> = {
  SEND_CONFIRMATION: "send a confirmation",
  SEND_QUESTIONNAIRE: "send the questionnaire",
  SEND_REMINDER: "send a reminder",
  SEND_THANK_YOU: "send a thank-you",
  SEND_PAYMENT_REMINDER: "send a payment reminder",
  SEND_FOLLOW_UP: "send a follow-up",
};

export default async function AutomationsPage() {
  const ctx = await requireBusiness();
  if (!ctx) redirect("/login");
  if (!STAFF_ROLES.includes(ctx.role)) redirect(homeRouteFor(ctx.role, ctx.business));
  const { business } = ctx;

  const automations = await prisma.automation.findMany({ where: { businessId: business.id }, orderBy: { createdAt: "asc" } });
  const recentRuns = await prisma.automationExecution.findMany({
    where: { businessId: business.id },
    orderBy: { ranAt: "desc" },
    take: 8,
    include: { automation: true },
  });

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-8 py-6 md:py-10">
      <PageHeader title="Automations" description="Runs automatically for every booking and payment — no manual chasing." />

      <Card className="mb-10">
        <div className="divide-y divide-border">
          {automations.map((a) => (
            <div key={a.id} className="flex items-center justify-between gap-4 px-4 py-3.5">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-medium">{a.name}</span>
                  {!a.enabled && <Badge tone="neutral">Off</Badge>}
                </div>
                <p className="text-xs text-ink/50">
                  {TRIGGER_LABEL[a.trigger]}
                  {a.offsetHours > 0 && ` (${a.offsetHours}h offset)`}, then {ACTION_LABEL[a.action]}
                </p>
                <p className="text-xs text-ink/35 truncate mt-0.5">{a.messageTemplate}</p>
              </div>
              <AutomationToggle id={a.id} enabled={a.enabled} />
            </div>
          ))}
        </div>
      </Card>

      {recentRuns.length > 0 && (
        <>
          <h2 className="text-sm font-medium text-ink mb-2.5">Recent activity</h2>
          <Card>
            <div className="divide-y divide-border">
              {recentRuns.map((r) => (
                <div key={r.id} className="flex items-center justify-between px-4 py-3 text-sm">
                  <span>{r.automation.name}</span>
                  <span className="text-xs text-ink/40">{r.result}</span>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
