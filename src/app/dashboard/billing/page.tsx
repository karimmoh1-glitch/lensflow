import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHeader, Card, CardBody, Badge } from "@/components/ui";
import { formatMoney } from "@/lib/utils";
import { PLANS, effectivePlan, type PlanKey } from "@/lib/billing";
import { subscriptionBillingIsLive } from "@/lib/subscriptionBilling";
import { UpgradeButton, ManageBillingButton } from "./PlanActions";
import { format } from "date-fns";

const STATUS_BADGE: Record<string, { tone: "success" | "warning" | "danger" | "neutral"; label: string }> = {
  ACTIVE: { tone: "success", label: "Active" },
  TRIALING: { tone: "success", label: "Trial" },
  PAST_DUE: { tone: "warning", label: "Payment failed — retrying" },
  CANCELED: { tone: "danger", label: "Canceled" },
  INCOMPLETE: { tone: "warning", label: "Incomplete" },
  INCOMPLETE_EXPIRED: { tone: "danger", label: "Expired" },
  UNPAID: { tone: "danger", label: "Unpaid" },
};

export default async function BillingPage() {
  const ctx = await requireRole(["OWNER", "ADMIN"]);
  if (!ctx) redirect("/dashboard");
  const { business } = ctx;

  const currentPlan = effectivePlan(business);
  const seatCount = await prisma.orgMembership.count({
    where: { businessId: business.id, role: { not: "CLIENT" }, status: "ACTIVE" },
  });

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-8 py-6 md:py-10">
      <PageHeader title="Billing" description="What your business pays for Daythread." />

      {!subscriptionBillingIsLive &&
        (process.env.NODE_ENV === "production" ? (
          <p className="text-sm text-ink/60 bg-signal-soft rounded-2xl px-4 py-3 mb-6">
            Billing is coming soon — plans below are shown for reference. We&apos;ll email you as soon as upgrades are open.
          </p>
        ) : (
          <p className="text-sm text-ink/50 bg-black/[0.03] rounded-md px-3.5 py-2.5 mb-6">
            Subscription billing isn&apos;t configured on this deployment — add <code className="text-xs bg-black/[0.05] px-1 rounded">STRIPE_SECRET_KEY</code>{" "}
            and <code className="text-xs bg-black/[0.05] px-1 rounded">STRIPE_WEBHOOK_SECRET</code> to accept real payments. Every plan below is shown for
            reference only until then.
          </p>
        ))}

      <Card className="mb-8">
        <CardBody className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-sans font-black text-section-title tracking-tight">{PLANS[currentPlan].name} plan</h2>
              {business.billingStatus && STATUS_BADGE[business.billingStatus] && (
                <Badge tone={STATUS_BADGE[business.billingStatus].tone}>{STATUS_BADGE[business.billingStatus].label}</Badge>
              )}
            </div>
            <p className="text-sm text-ink/50 mt-1">
              {PLANS[currentPlan].maxTeamSeats === Infinity
                ? `${seatCount} team seats used`
                : seatCount > PLANS[currentPlan].maxTeamSeats
                  ? `${seatCount} team seats used — over your plan's ${PLANS[currentPlan].maxTeamSeats}-seat limit; new invites are blocked until you upgrade`
                  : `${seatCount} of ${PLANS[currentPlan].maxTeamSeats} team seats used`}
              {business.currentPeriodEnd && business.billingStatus && ["ACTIVE", "TRIALING", "PAST_DUE"].includes(business.billingStatus) && (
                <>
                  {" · "}
                  {business.cancelAtPeriodEnd ? "Cancels" : "Renews"} {format(business.currentPeriodEnd, "MMM d, yyyy")}
                </>
              )}
            </p>
          </div>
          {business.stripeCustomerId && <ManageBillingButton />}
        </CardBody>
      </Card>

      <div className="grid sm:grid-cols-3 gap-4">
        {(Object.keys(PLANS) as PlanKey[]).map((key) => {
          const plan = PLANS[key];
          const isCurrent = key === currentPlan;
          return (
            <Card key={key} className={isCurrent ? "border-ink" : undefined}>
              <CardBody>
                <div className="flex items-center justify-between mb-1">
                  <h3 className="font-sans font-black text-lg tracking-tight">{plan.name}</h3>
                  {isCurrent && <Badge tone="accent">Current</Badge>}
                </div>
                <p className="text-2xl font-semibold text-ink mb-1">
                  {plan.priceCents === 0 ? "Free" : formatMoney(plan.priceCents)}
                  {plan.priceCents > 0 && <span className="text-sm font-normal text-ink/45">/mo</span>}
                </p>
                <p className="text-xs text-ink/50 mb-4">{plan.tagline}</p>
                <ul className="space-y-1.5 mb-5">
                  {plan.features.map((f) => (
                    <li key={f} className="text-xs text-ink/65 flex items-start gap-1.5">
                      <span className="text-success mt-0.5">✓</span>
                      {f}
                    </li>
                  ))}
                </ul>
                {!isCurrent && key !== "FREE" && <UpgradeButton planKey={key as "PRO" | "BUSINESS"}>Upgrade to {plan.name}</UpgradeButton>}
                {!isCurrent && key === "FREE" && business.stripeCustomerId && (
                  <p className="text-xs text-ink/40">Cancel from Manage billing above to downgrade.</p>
                )}
              </CardBody>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
