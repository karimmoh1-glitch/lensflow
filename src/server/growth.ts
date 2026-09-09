import { prisma } from "@/lib/db";
import { subDays } from "date-fns";
import { PLANS } from "@/lib/billing";
import { getAttention } from "@/server/attention";

/**
 * The founder dashboard's numbers. Every figure is a count from the database over the
 * window; nothing is projected. Aggregates only — per-business rows carry names, plans,
 * connection states and counts, never message text, addresses or credentials.
 */
const ACTIVE = ["CONNECTED", "NEEDS_ATTENTION", "SYNC_ERROR"] as const;
const FIRST_ACTION = ["first_reply_sent", "first_booking_created", "first_followup_created", "first_priority_action", "first_ai_action"];

async function distinctBusinesses(names: string[], since: Date): Promise<Record<string, number>> {
  const rows = await prisma.analyticsEvent.groupBy({ by: ["name", "businessId"], where: { name: { in: names }, createdAt: { gte: since }, businessId: { not: null } } });
  const out: Record<string, number> = Object.fromEntries(names.map((n) => [n, 0]));
  for (const r of rows) out[r.name] = (out[r.name] ?? 0) + 1;
  return out;
}
async function distinctAnonymous(names: string[], since: Date): Promise<Record<string, number>> {
  const rows = await prisma.analyticsEvent.groupBy({ by: ["name", "anonymousId"], where: { name: { in: names }, createdAt: { gte: since }, anonymousId: { not: null } } });
  const out: Record<string, number> = Object.fromEntries(names.map((n) => [n, 0]));
  for (const r of rows) out[r.name] = (out[r.name] ?? 0) + 1;
  return out;
}
const tally = (values: (string | null | undefined)[]) => {
  const m: Record<string, number> = {};
  for (const v of values) if (v) m[v] = (m[v] ?? 0) + 1;
  return Object.entries(m).sort((a, b) => b[1] - a[1]);
};

export async function getGrowth(days = 30) {
  const since = subDays(new Date(), days);
  const [anon, biz, businesses, profiles, subs, integrations, attention, convCount, inboundCount, bookingCount, automationsOn, agentApprovals, activeRows] = await Promise.all([
    distinctAnonymous(["landing_view", "landing_cta", "referral_started", "onboarding_started", "onboarding_skipped", "personalization_completed", "recommended_plan_shown"], since),
    distinctBusinesses(["signup_completed", "workspace_created", "onboarding_completed", "first_channel_connected", "first_message_received", "first_conversation_viewed", ...FIRST_ACTION, "first_automation_created", "paywall_shown", "paywall_cta", "checkout_started", "trial_started", "subscription_started", "subscription_canceled", "referral_signup", "referral_activated", "referral_converted", "personalization_created"], since),
    prisma.business.findMany({ where: { createdAt: { gte: since } }, select: { id: true } }),
    prisma.onboardingProfile.findMany({ where: { createdAt: { gte: since } }, select: { businessStatus: true, userType: true, teamSize: true, recommendedPlan: true, selectedPlan: true, channels: true, painPoints: true, workCategory: true } }),
    prisma.business.findMany({ where: { planTier: { not: "FREE" } }, select: { planTier: true, billingStatus: true, currentPeriodEnd: true, trialEndsAt: true, cancelAtPeriodEnd: true } }),
    prisma.integration.groupBy({ by: ["provider"], where: { status: { in: [...ACTIVE] } }, _count: { _all: true } }),
    prisma.integration.groupBy({ by: ["provider"], where: { status: { in: ["NEEDS_ATTENTION", "SYNC_ERROR"] } }, _count: { _all: true } }),
    prisma.conversation.count({ where: { createdAt: { gte: since } } }),
    prisma.message.count({ where: { createdAt: { gte: since }, direction: "INBOUND" } }),
    prisma.booking.count({ where: { createdAt: { gte: since } } }),
    prisma.automation.count({ where: { enabled: true } }),
    prisma.analyticsEvent.count({ where: { name: "agent_action_approved", createdAt: { gte: since } } }),
    prisma.analyticsEvent.groupBy({ by: ["businessId"], where: { createdAt: { gte: subDays(new Date(), 7) }, businessId: { not: null }, name: { notIn: ["landing_view", "landing_cta"] } } }),
  ]);
  const now = new Date();
  const paidActive = subs.filter((s) => s.billingStatus === "ACTIVE");
  const trialing = subs.filter((s) => s.billingStatus === "TRIALING");
  // Monthly recurring: annual subscriptions (period end more than 40 days out) count at the yearly price over twelve months.
  const mrrCents = paidActive.reduce((sum, s) => {
    const monthly = PLANS[s.planTier].priceCents;
    const annual = s.currentPeriodEnd && s.currentPeriodEnd.getTime() - now.getTime() > 40 * 86400000;
    return sum + (annual ? Math.round((monthly * 10) / 12) : monthly);
  }, 0);
  const firstAction = await prisma.analyticsEvent.groupBy({ by: ["businessId"], where: { name: { in: FIRST_ACTION }, createdAt: { gte: since }, businessId: { not: null } } });
  const totalBusinesses = await prisma.business.count();
  // Retained: active again at least a day after the workspace was created.
  const retainedRows = await prisma.$queryRaw<{ n: bigint }[]>`SELECT COUNT(DISTINCT e."businessId") AS n FROM "AnalyticsEvent" e JOIN "Business" b ON b.id = e."businessId" WHERE e."createdAt" >= ${since} AND e."createdAt" > b."createdAt" + interval '1 day' AND e.name NOT IN ('landing_view','landing_cta')`;
  const retained = Number(retainedRows[0]?.n ?? 0);
  // Persona conversion: of the profiles in the window, how many workspaces now pay.
  const paidBiz = new Set((await prisma.business.findMany({ where: { planTier: { not: "FREE" }, billingStatus: "ACTIVE" }, select: { id: true } })).map((b) => b.id));
  const profileRows = await prisma.onboardingProfile.findMany({ where: { createdAt: { gte: since } }, select: { businessId: true, businessStatus: true, recommendedPlan: true } });
  const personaConv = new Map<string, { n: number; paid: number }>();
  for (const pr of profileRows) { const k = pr.businessStatus; const cur = personaConv.get(k) ?? { n: 0, paid: 0 }; cur.n += 1; if (paidBiz.has(pr.businessId)) cur.paid += 1; personaConv.set(k, cur); }
  const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : null);
  // Failures the integrations reported, last 24 hours, by area — the read side of reportFailure.
  const dayAgo = new Date(Date.now() - 24 * 3600 * 1000);
  const opsRows = await prisma.opsEvent.findMany({ where: { createdAt: { gte: dayAgo } }, orderBy: { createdAt: "desc" }, take: 300, select: { area: true, level: true, message: true, provider: true, createdAt: true, businessId: true } });
  const failures = new Map<string, { n: number; latest: string; at: Date; workspaces: Set<string> }>();
  for (const e of opsRows) { const cur = failures.get(e.area) ?? { n: 0, latest: e.message, at: e.createdAt, workspaces: new Set<string>() }; cur.n += 1; if (e.businessId) cur.workspaces.add(e.businessId); failures.set(e.area, cur); }
  const comped = await prisma.business.findMany({ where: { compedPlan: { not: null } }, select: { name: true, handle: true, compedPlan: true, orgMemberships: { where: { role: "OWNER" }, select: { user: { select: { email: true } } }, take: 1 } }, orderBy: { createdAt: "desc" }, take: 50 });

  return {
    days,
    acquisition: { visitors: anon.landing_view, startClicks: anon.landing_cta, referralVisits: anon.referral_started, startOpened: anon.onboarding_started, questionsFinished: anon.personalization_completed, skipped: anon.onboarding_skipped, signups: biz.signup_completed, newWorkspaces: businesses.length },
    activation: { onboardingCompleted: biz.onboarding_completed, firstChannel: biz.first_channel_connected, firstMessage: biz.first_message_received, firstConversationViewed: biz.first_conversation_viewed, firstAction: firstAction.length, firstFollowUp: biz.first_followup_created, firstBooking: biz.first_booking_created, firstAutomation: biz.first_automation_created, firstAgent: biz.first_ai_action },
    engagement: { totalBusinesses, activeBusinesses7d: activeRows.length, conversations: convCount, inboundMessages: inboundCount, bookings: bookingCount, automationsOn, agentApprovals, connectedByProvider: Object.fromEntries(integrations.map((i) => [i.provider, i._count._all])), attentionByProvider: Object.fromEntries(attention.map((i) => [i.provider, i._count._all])) },
    revenue: { paywallShown: biz.paywall_shown, paywallCta: biz.paywall_cta, checkoutStarted: biz.checkout_started, trialsStarted: biz.trial_started, trialingNow: trialing.length, paidNow: paidActive.length, byPlan: tally(paidActive.map((s) => s.planTier)), mrrCents, cancellations: biz.subscription_canceled, cancelAtPeriodEnd: subs.filter((s) => s.cancelAtPeriodEnd).length, subscriptionsStarted: biz.subscription_started },
    funnel: { signupToChannel: pct(biz.first_channel_connected, biz.signup_completed), channelToFirstAction: pct(firstAction.length, biz.first_channel_connected), signupToTrial: pct(biz.trial_started, biz.signup_completed), trialToPaid: biz.trial_started > 0 ? pct(paidActive.length, biz.trial_started) : null, paywallToCheckout: pct(biz.checkout_started, biz.paywall_shown) },
    personas: { businessStatus: tally(profiles.map((p) => p.businessStatus)), userType: tally(profiles.map((p) => p.userType)), workCategory: tally(profiles.map((p) => p.workCategory)), teamSize: tally(profiles.map((p) => p.teamSize)), recommendedPlan: tally(profiles.map((p) => p.recommendedPlan)), selectedPlan: tally(profiles.map((p) => p.selectedPlan)), channels: tally(profiles.flatMap((p) => p.channels)), painPoints: tally(profiles.flatMap((p) => p.painPoints)), profiles: profiles.length },
    referrals: { visits: anon.referral_started, signups: biz.referral_signup, activated: biz.referral_activated, converted: biz.referral_converted },
    // Each step counts workspaces; "drop" is the share of the previous step that did not reach this one.
    activationFunnel: (() => {
      const steps: [string, number][] = [
        ["Signed up", biz.signup_completed],
        ["Finished onboarding", biz.onboarding_completed],
        ["Connected a channel", biz.first_channel_connected],
        ["Opened a real conversation", biz.first_conversation_viewed],
        ["Took a first action", firstAction.length],
        ["Came back after day one", retained],
        ["Started a trial", biz.trial_started],
        ["Paid", biz.subscription_started],
      ];
      return steps.map(([label, n], i) => ({ label, n, drop: i === 0 || steps[i - 1][1] === 0 ? null : Math.max(0, Math.round((1 - n / steps[i - 1][1]) * 100)) }));
    })(),
    failures24h: [...failures.entries()].map(([area, v]) => ({ area, n: v.n, workspaces: v.workspaces.size, latest: v.latest.slice(0, 160), at: v.at })).sort((a, b) => b.n - a.n),
    comped: comped.map((b) => ({ name: b.name, handle: b.handle, plan: b.compedPlan as string, owner: b.orgMemberships[0]?.user.email ?? null })),
    personaConversion: [...personaConv.entries()].map(([status, v]) => ({ status, n: v.n, paid: v.paid, rate: v.n ? Math.round((v.paid / v.n) * 100) : 0 })).sort((a, b) => b.rate - a.rate || b.n - a.n),
  };
}

export type BusinessRow = { id: string; name: string; handle: string; plan: string; billingStatus: string | null; createdAt: Date; referredBy: string | null; channels: string[]; conversations: number; bookings: number; automationsOn: number; lastActivity: Date | null; persona: string | null; owner: string | null };

/** Recent workspaces, one row each, newest first. */
export async function listBusinesses(limit = 60): Promise<BusinessRow[]> {
  const rows = await prisma.business.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true, name: true, handle: true, planTier: true, billingStatus: true, createdAt: true, referredById: true,
      integrations: { where: { status: { in: [...ACTIVE] } }, select: { provider: true } },
      onboardingProfile: { select: { businessStatus: true, workCategory: true } },
      orgMemberships: { where: { role: "OWNER" }, take: 1, select: { user: { select: { email: true } } } },
      _count: { select: { conversations: true, bookings: true } },
      automations: { where: { enabled: true }, select: { id: true } },
      conversations: { orderBy: { lastMessageAt: "desc" }, take: 1, select: { lastMessageAt: true } },
      analyticsEvents: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
    },
  });
  const referrers = new Map((await prisma.business.findMany({ where: { id: { in: rows.map((r) => r.referredById).filter((x): x is string => Boolean(x)) } }, select: { id: true, name: true } })).map((b) => [b.id, b.name]));
  return rows.map((b) => {
    const last = [b.conversations[0]?.lastMessageAt, b.analyticsEvents[0]?.createdAt].filter((d): d is Date => Boolean(d)).sort((x, y) => y.getTime() - x.getTime())[0] ?? null;
    return { id: b.id, name: b.name, handle: b.handle, plan: b.planTier, billingStatus: b.billingStatus, createdAt: b.createdAt, referredBy: b.referredById ? referrers.get(b.referredById) ?? "another workspace" : null, channels: b.integrations.map((i) => i.provider), conversations: b._count.conversations, bookings: b._count.bookings, automationsOn: b.automations.length, lastActivity: last, persona: b.onboardingProfile ? `${b.onboardingProfile.businessStatus} · ${b.onboardingProfile.workCategory}` : null, owner: b.orgMemberships[0]?.user.email ?? null };
  });
}

/** One workspace in depth, for working closely with a design partner. Names, states, counts and event names only. */
export async function getBusinessDetail(handle: string) {
  const b = await prisma.business.findUnique({
    where: { handle },
    select: {
      id: true, name: true, handle: true, planTier: true, billingStatus: true, createdAt: true, timezone: true, onboardingComplete: true, trialEndsAt: true, currentPeriodEnd: true, referredById: true, referralCode: true,
      onboardingProfile: true,
      integrations: { select: { provider: true, status: true, lastSyncedAt: true, lastSyncStatus: true, lastErrorAt: true, wanted: true, updatedAt: true } },
      orgMemberships: { where: { status: "ACTIVE" }, select: { role: true, createdAt: true, user: { select: { name: true, email: true } } } },
      automations: { select: { name: true, enabled: true, createdAt: true } },
      services: { select: { name: true, durationMins: true, priceCents: true } },
      _count: { select: { conversations: true, bookings: true, clients: true, leads: true } },
    },
  });
  if (!b) return null;
  const [events, eventTotals, leads, followUps, attention, referred, runs, categories, potentialClients, summaries, clientsWithConversation] = await Promise.all([
    prisma.analyticsEvent.findMany({ where: { businessId: b.id, name: { notIn: ["landing_view", "landing_cta"] } }, orderBy: { createdAt: "desc" }, take: 80, select: { name: true, createdAt: true, properties: true } }),
    prisma.analyticsEvent.groupBy({ by: ["name"], where: { businessId: b.id }, _count: { _all: true } }),
    prisma.lead.groupBy({ by: ["status"], where: { businessId: b.id }, _count: { _all: true } }),
    prisma.lead.count({ where: { businessId: b.id, followUpAt: { not: null } } }),
    getAttention(b.id, new Date(), b.timezone),
    prisma.business.count({ where: { referredById: b.id } }),
    prisma.automationExecution.count({ where: { businessId: b.id } }),
    prisma.conversation.groupBy({ by: ["category"], where: { businessId: b.id }, _count: { _all: true } }),
    prisma.client.count({ where: { businessId: b.id, relationship: "LEAD", conversations: { some: { category: "PRIORITY", archived: false } } } }),
    prisma.message.count({ where: { conversation: { businessId: b.id }, summaryAt: { not: null } } }),
    prisma.client.count({ where: { businessId: b.id, conversations: { some: { category: "PRIORITY" } } } }),
  ]);
  // Properties are option keys, plan keys and feature ids by construction; still, only a few named keys are shown.
  const safeProps = (p: unknown) => {
    if (!p || typeof p !== "object") return "";
    const o = p as Record<string, unknown>;
    return ["provider", "feature", "source", "planKey", "recommendedPlan", "selectedPlan", "channel", "via", "kind", "step", "method", "trial", "interval"].filter((k) => o[k] !== undefined).map((k) => `${k}=${String(o[k])}`).join(" ");
  };
  return {
    ...b,
    events: events.map((e) => ({ name: e.name, at: e.createdAt, props: safeProps(e.properties) })),
    eventTotals: eventTotals.map((e) => [e.name, e._count._all] as [string, number]).sort((x, y) => y[1] - x[1]),
    leadsByStatus: leads.map((l) => [l.status, l._count._all] as [string, number]),
    followUpsSet: followUps,
    attentionNow: attention.map((a) => ({ label: a.item.label, why: a.item.why })),
    referredCount: referred,
    automationRuns: runs,
    // The intelligence layer: what was kept out of the way, who counts as a person, and what was summarized.
    conversationsByCategory: categories.map((c) => [c.category, c._count._all] as [string, number]).sort((x, y) => y[1] - x[1]),
    potentialClients: potentialClients,
    peopleWithConversation: clientsWithConversation,
    messageSummaries: summaries,
  };
}
