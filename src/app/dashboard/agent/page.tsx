import { redirect } from "next/navigation";
import Link from "next/link";
import { requireBusiness, homeRouteFor, STAFF_ROLES } from "@/lib/auth";
import { businessAgentEntitled, effectivePlan, PLANS } from "@/lib/billing";
import { buildAgentBrief } from "@/server/businessAgent";
import { PageHeader } from "@/components/ui";
import { AgentBoard } from "./AgentBoard";
import { Bot, MessageSquare, CalendarCheck, Wallet, RotateCcw, Workflow, Lock } from "lucide-react";

/**
 * The Daythread Business Agent. Business only: the plan is read from the database by this
 * page and again by every action the board calls, so the gate cannot be talked around from
 * the browser. Free and Pro see what it does and where to get it — not a fake, unlocked UI.
 */
export default async function AgentPage() {
  const ctx = await requireBusiness();
  if (!ctx) redirect("/login");
  if (!STAFF_ROLES.includes(ctx.role)) redirect(homeRouteFor(ctx.role, ctx.business));
  const { business } = ctx;
  const entitled = businessAgentEntitled(business);
  const plan = effectivePlan(business);

  if (!entitled) {
    const canBill = ctx.role === "OWNER" || ctx.role === "ADMIN";
    return (
      <div className="max-w-3xl mx-auto px-4 md:px-8 py-6 md:py-10">
        <PageHeader title="Business Agent" description="Daythread proposes the day's work and carries it out when you approve." />
        <section className="rounded-[26px] border border-border bg-white overflow-hidden">
          <div className="px-6 py-6 md:px-8 md:py-8 bg-[radial-gradient(120%_140%_at_0%_0%,rgba(109,90,230,0.12),transparent_55%)]">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-signal-text"><Lock className="w-3 h-3" strokeWidth={2.5} aria-hidden /> Business plan</span>
            <h2 className="mt-2 font-sans font-extrabold text-[1.6rem] md:text-[1.9rem] leading-[1.05] tracking-[-0.03em] text-ink">Let Daythread run more of the business.</h2>
            <p className="mt-2 max-w-xl text-sm text-ink/65 leading-relaxed">The agent reads what is actually happening — who is waiting, what isn&rsquo;t confirmed, what is due, who went quiet — and proposes the exact next action with the message ready. You approve; it sends, records and moves things forward.</p>
            <ul className="mt-5 grid sm:grid-cols-2 gap-2.5">
              {[
                [MessageSquare, "Replies drafted from the real thread and your real prices"],
                [CalendarCheck, "Confirmations for bookings that aren't confirmed yet"],
                [Wallet, "Balance and deposit reminders, before and after they're due"],
                [RotateCcw, "Follow-ups for leads that went quiet after you replied"],
                [Workflow, "Calendar and workflow issues surfaced before they cost a booking"],
              ].map(([Icon, text], i) => {
                const I = Icon as typeof MessageSquare;
                return (
                  <li key={i} className="flex items-start gap-2.5 rounded-xl border border-border bg-white/80 px-3.5 py-3 text-sm text-ink/80">
                    <span className="w-7 h-7 rounded-lg bg-signal/10 text-signal-text flex items-center justify-center shrink-0"><I className="w-3.5 h-3.5" strokeWidth={2} aria-hidden /></span>
                    <span className="leading-snug">{text as string}</span>
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="px-6 py-4 md:px-8 border-t border-border flex flex-col sm:flex-row sm:items-center gap-3">
            <p className="flex-1 text-sm text-ink/65">You&rsquo;re on <span className="font-semibold text-ink">{PLANS[plan].name}</span>. Business is {`$${(PLANS.BUSINESS.priceCents / 100).toFixed(0)}`}/month with unlimited integrations, automations and seats.</p>
            {canBill ? (
              <Link href="/dashboard/billing" className="inline-flex items-center justify-center h-10 px-5 rounded-full bg-ink text-white text-sm font-bold hover:bg-black transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50">Upgrade to Business →</Link>
            ) : (
              <span className="text-xs text-ink/50">Ask the workspace owner to upgrade.</span>
            )}
          </div>
        </section>
      </div>
    );
  }

  const brief = await buildAgentBrief(business.id);
  return (
    <div className="max-w-3xl mx-auto px-4 md:px-8 py-6 md:py-10">
      <PageHeader
        title="Business Agent"
        description="What Daythread would do next, with the message ready. Nothing is sent until you approve it."
        action={<span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-signal-text bg-signal-soft rounded-full px-2.5 py-1"><Bot className="w-3.5 h-3.5" strokeWidth={2} aria-hidden /> Business</span>}
      />
      <AgentBoard initial={{ generatedAt: brief.generatedAt.toISOString(), proposals: brief.proposals, activity: brief.activity.map((a) => ({ ...a, at: a.at.toISOString() })) }} />
    </div>
  );
}
