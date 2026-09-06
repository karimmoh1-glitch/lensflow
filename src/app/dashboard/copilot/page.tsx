import { redirect } from "next/navigation";
import { requireBusiness, homeRouteFor, STAFF_ROLES } from "@/lib/auth";
import { planLimits, effectivePlan, PLANS } from "@/lib/billing";
import { prisma } from "@/lib/db";
import { startOfDay } from "date-fns";
import { CopilotChat } from "./CopilotChat";

/**
 * Copilot: ask about the business in plain words, answered from its real records. Free gets
 * a daily allowance (counted on the server); the page shows exactly where that stands.
 */
export default async function CopilotPage() {
  const ctx = await requireBusiness();
  if (!ctx) redirect("/login");
  if (!STAFF_ROLES.includes(ctx.role)) redirect(homeRouteFor(ctx.role, ctx.business));
  const { business, user } = ctx;
  const limits = planLimits(business);
  const plan = effectivePlan(business);
  const daily = Number.isFinite(limits.copilotDailyLimit) ? limits.copilotDailyLimit : null;
  const usedToday = daily ? await prisma.analyticsEvent.count({ where: { businessId: business.id, name: "copilot_question", createdAt: { gte: startOfDay(new Date()) } } }) : 0;
  const [openLeads, unpaid, todayBookings] = await Promise.all([
    prisma.lead.count({ where: { businessId: business.id, status: { in: ["NEW", "CONTACTED", "QUALIFIED"] }, respondedAt: null } }),
    prisma.payment.count({ where: { businessId: business.id, status: "AWAITING_CONFIRMATION" } }),
    prisma.booking.count({ where: { businessId: business.id, startAt: { gte: startOfDay(new Date()), lt: new Date(startOfDay(new Date()).getTime() + 86_400_000) }, status: { not: "CANCELED" } } }),
  ]);
  // Suggestions that reflect what is actually going on, so the first question is a good one.
  const suggestions = [
    openLeads > 0 ? `Who is waiting on a reply, and what did they ask for?` : "Which leads are most likely to book?",
    unpaid > 0 ? "Who owes me money right now?" : "How much have I collected this month?",
    todayBookings > 0 ? "What do I have today, and is anything unconfirmed?" : "What's on my calendar this week?",
    "Which customers haven't heard from me in a while?",
  ];

  return (
    <div className="max-w-2xl mx-auto px-4 md:px-8 pt-6 md:pt-10 flex flex-col h-[calc(100dvh-3.5rem-4rem-env(safe-area-inset-bottom))] md:h-[calc(100dvh-2.5rem)]">
      <CopilotChat firstName={user.name.split(" ")[0]} businessName={business.name} planName={PLANS[plan].name} daily={daily} usedToday={usedToday} suggestions={suggestions} />
    </div>
  );
}
