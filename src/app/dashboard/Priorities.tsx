import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { prisma } from "@/lib/db";
import { getPersonalization } from "@/server/personalization";
import { PRIORITY_COPY, PROVIDER_LABEL, list, type Feature, type PlanKey } from "@/lib/personalization";
import { cn } from "@/lib/utils";

const ACTIVE = ["CONNECTED", "NEEDS_ATTENTION", "SYNC_ERROR"] as const;

/**
 * The first weeks' setup card on Today: the two to four things the owner said matter,
 * each with the one real next step for it — connect the channels they named, set services
 * and hours if they take bookings, write the first automation, meet the assistant. Every
 * state comes from the database; a step that's done says so.
 */
export async function Priorities({ businessId, plan }: { businessId: string; plan: PlanKey }) {
  const p = await getPersonalization(businessId);
  if (!p) return null;
  const [integrations, services, automations, seats] = await Promise.all([
    prisma.integration.findMany({ where: { businessId }, select: { provider: true, status: true } }),
    prisma.service.count({ where: { businessId } }),
    prisma.automation.count({ where: { businessId } }),
    prisma.orgMembership.count({ where: { businessId, status: "ACTIVE", role: { not: "CLIENT" } } }),
  ]);
  const connected = integrations.filter((r) => (ACTIVE as readonly string[]).includes(r.status)).map((r) => r.provider as string);
  const toConnect = p.connectProviders.filter((x) => x !== "GOOGLE_CALENDAR" && !connected.includes(x));
  const calendarWanted = p.connectProviders.includes("GOOGLE_CALENDAR") && !connected.includes("GOOGLE_CALENDAR");

  const cards = p.priorities.map((f: Feature) => {
    const base = PRIORITY_COPY[f];
    let cta = "Open"; let href = base.href; let done = false;
    switch (f) {
      case "inbox":
        if (toConnect.length) { cta = `Connect ${list(toConnect.map((x) => PROVIDER_LABEL[x]))}`; href = "/dashboard/settings?tab=channels"; }
        else { cta = "Open your inbox"; done = connected.length > 0; }
        break;
      case "bookings":
        if (services === 0) { cta = "Set your services and hours"; href = "/dashboard/settings?tab=business"; }
        else { cta = "Open bookings"; done = true; }
        break;
      case "calendar":
        if (calendarWanted) { cta = "Connect Google Calendar"; href = "/dashboard/settings?tab=channels"; }
        else { cta = "Open your calendar"; done = connected.includes("GOOGLE_CALENDAR") || connected.includes("APPLE_CALENDAR"); }
        break;
      case "automations":
        if (automations === 0) cta = "Create your first automation";
        else { cta = `${automations} written`; done = true; }
        break;
      case "agent":
        cta = plan === "FREE" ? "Meet your Business Agent" : "Open the assistant";
        break;
      case "team":
        if (seats <= 1) { cta = "Invite someone"; href = "/dashboard/settings?tab=team"; }
        else { cta = `${seats} people on this inbox`; href = "/dashboard/settings?tab=team"; done = true; }
        break;
      case "people":
        cta = "Open People";
        break;
    }
    return { key: f, title: base.title, blurb: base.blurb, cta, href, done };
  });

  return (
    <section aria-labelledby="priorities-label" className="mb-8 rounded-[22px] border border-border bg-white overflow-hidden">
      <div className="px-5 md:px-6 pt-5 pb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="priorities-label" className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink/65">Set up around the way you work</h2>
        <Link href="/dashboard/settings?tab=profile" className="text-xs font-semibold text-ink/65 hover:text-ink">Change how you work →</Link>
      </div>
      <ul className="px-5 md:px-6 pb-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
        {cards.map((c, i) => (
          <li key={c.key} className={cn("rounded-2xl border px-4 py-3.5 flex flex-col gap-2", i === 0 && !c.done ? "border-accent/40 bg-accent-soft/40" : "border-border bg-paper")}>
            <div>
              <div className="text-sm font-extrabold text-ink">{c.title}</div>
              <div className="mt-0.5 text-xs text-ink/70 leading-relaxed">{c.blurb}</div>
            </div>
            <Link href={c.href} className={cn("mt-auto inline-flex items-center gap-1 text-[13px] font-bold w-fit rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50", c.done ? "text-success-text" : i === 0 ? "text-accent-text" : "text-ink")}>
              {c.done && <span aria-hidden>✓</span>}{c.cta}{!c.done && <ArrowRight className="w-3.5 h-3.5" strokeWidth={2.5} aria-hidden />}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
