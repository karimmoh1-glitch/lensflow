import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { format, formatDistanceToNowStrict } from "date-fns";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isFounder } from "@/lib/founder";
import { getGrowth, listBusinesses, getBusinessDetail } from "@/server/growth";
import { getAiSpend } from "@/server/aiUsage";
import { formatCostMicros, AI_RATE_LIMITS, DAILY_CALL_CEILING, ASSISTANT_HOURLY_LIMIT, AI_FEATURE_LABEL, type AiFeature } from "@/lib/aiPolicy";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * The founder dashboard: acquisition → activation → engagement → revenue, the personas
 * coming through /start, referrals, and one workspace in depth for working with a design
 * partner. Gated by FOUNDER_EMAILS; anyone else — or a deployment without the variable —
 * gets a 404, not a hint. Nothing here is a message body, an address or a credential.
 */
export default async function GrowthPage({ searchParams }: { searchParams: Promise<{ days?: string; b?: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { email: true } });
  if (!isFounder(user?.email)) notFound();
  const sp = await searchParams;
  const days = [7, 30, 90].includes(Number(sp.days)) ? Number(sp.days) : 30;
  const detail = sp.b ? await getBusinessDetail(sp.b.slice(0, 60)) : null;
  const [g, businesses, ai] = await Promise.all([getGrowth(days), listBusinesses(), getAiSpend()]);
  const money = (c: number) => `$${(c / 100).toFixed(0)}`;
  const n = (v: number | null | undefined) => (v === null || v === undefined ? "—" : String(v));
  const p = (v: number | null) => (v === null ? "—" : `${v}%`);

  return (
    <main className="min-h-screen bg-paper">
      <div className="max-w-6xl mx-auto px-5 md:px-8 py-8 md:py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink/65">Founders only</p>
            <h1 className="mt-1 font-sans font-extrabold text-[1.9rem] leading-none tracking-[-0.03em] text-ink">Growth</h1>
            <p className="mt-2 text-sm text-ink/65">Counts from the database over the last {days} days. Nothing projected, nothing sampled.</p>
          </div>
          <nav aria-label="Window" className="flex items-center gap-1 rounded-full bg-black/[0.04] p-1">
            {[7, 30, 90].map((d) => (
              <Link key={d} href={`/admin/growth?days=${d}${sp.b ? `&b=${sp.b}` : ""}`} aria-current={days === d ? "page" : undefined} className={cn("h-8 px-3.5 rounded-full text-[13px] font-semibold inline-flex items-center", days === d ? "bg-white text-ink shadow-xs" : "text-ink/70 hover:text-ink")}>{d}d</Link>
            ))}
          </nav>
        </div>

        <div className="mt-8 grid md:grid-cols-2 xl:grid-cols-4 gap-4">
          <Block title="Acquisition" rows={[["Landing visitors", n(g.acquisition.visitors)], ["Start clicks", n(g.acquisition.startClicks)], ["Referral visits", n(g.acquisition.referralVisits)], ["/start opened", n(g.acquisition.startOpened)], ["Questions finished", n(g.acquisition.questionsFinished)], ["Skipped setup", n(g.acquisition.skipped)], ["Signups", n(g.acquisition.signups)], ["New workspaces", n(g.acquisition.newWorkspaces)]]} />
          <Block title="Activation" rows={[["Onboarding completed", n(g.activation.onboardingCompleted)], ["First channel connected", n(g.activation.firstChannel)], ["First message received", n(g.activation.firstMessage)], ["First conversation viewed", n(g.activation.firstConversationViewed)], ["First meaningful action", n(g.activation.firstAction)], ["First follow-up set", n(g.activation.firstFollowUp)], ["First booking", n(g.activation.firstBooking)], ["First automation", n(g.activation.firstAutomation)], ["First agent action", n(g.activation.firstAgent)]]} />
          <Block title="Engagement" rows={[["Workspaces, total", n(g.engagement.totalBusinesses)], ["Active in last 7 days", n(g.engagement.activeBusinesses7d)], ["New conversations", n(g.engagement.conversations)], ["Inbound messages", n(g.engagement.inboundMessages)], ["Bookings created", n(g.engagement.bookings)], ["Automations on (all time)", n(g.engagement.automationsOn)], ["Agent actions approved", n(g.engagement.agentApprovals)], ...Object.entries(g.engagement.connectedByProvider).map(([k, v]) => [`Connected · ${k}`, String(v)] as [string, string])]} />
          <Block title="Revenue" rows={[["Paywalls shown (workspaces)", n(g.revenue.paywallShown)], ["Paywall CTA clicked", n(g.revenue.paywallCta)], ["Checkouts started", n(g.revenue.checkoutStarted)], ["Trials started", n(g.revenue.trialsStarted)], ["Trialing now", n(g.revenue.trialingNow)], ["Paying now", n(g.revenue.paidNow)], ...g.revenue.byPlan.map(([k, v]) => [`· ${k}`, String(v)] as [string, string]), ["MRR", money(g.revenue.mrrCents)], ["Cancellations", n(g.revenue.cancellations)], ["Set to cancel at period end", n(g.revenue.cancelAtPeriodEnd)]]} />
        </div>

        <div className="mt-4 grid md:grid-cols-2 xl:grid-cols-4 gap-4">
          <Block title="Funnel" rows={[["Signup → channel", p(g.funnel.signupToChannel)], ["Channel → first action", p(g.funnel.channelToFirstAction)], ["Signup → trial", p(g.funnel.signupToTrial)], ["Trial → paid", p(g.funnel.trialToPaid)], ["Paywall → checkout", p(g.funnel.paywallToCheckout)]]} />
          <Block title="Referrals" rows={[["Visits from a link", n(g.referrals.visits)], ["Signups attributed", n(g.referrals.signups)], ["Activated (first channel)", n(g.referrals.activated)], ["Converted (paid)", n(g.referrals.converted)]]} />
          <Block title={`Personas (${g.personas.profiles} profiles)`} rows={[...g.personas.businessStatus.map(([k, v]) => [`Status · ${k}`, String(v)] as [string, string]), ...g.personas.workCategory.slice(0, 6).map(([k, v]) => [`Work · ${k}`, String(v)] as [string, string]), ...g.personas.teamSize.map(([k, v]) => [`Team · ${k}`, String(v)] as [string, string])]} />
          <Block title="Failures, last 24 hours" rows={g.failures24h.length === 0 ? [["Nothing reported", "0"]] : g.failures24h.map((f) => [`${f.area} · ${f.workspaces} ${f.workspaces === 1 ? "workspace" : "workspaces"} · ${f.latest}`, String(f.n)] as [string, string])} />
          <Block title={`Complimentary access (${g.comped.length}, not in MRR)`} rows={g.comped.length === 0 ? [["None granted", "0"]] : g.comped.map((c) => [`${c.name} /${c.handle}${c.owner ? ` · ${c.owner}` : ""}`, c.plan] as [string, string])} />
          <Block title="Recommended vs chosen" rows={[...g.personas.recommendedPlan.map(([k, v]) => [`Recommended · ${k}`, String(v)] as [string, string]), ...g.personas.selectedPlan.map(([k, v]) => [`Chose · ${k}`, String(v)] as [string, string]), ...g.personas.channels.map(([k, v]) => [`Channel · ${k}`, String(v)] as [string, string]), ...g.personas.painPoints.slice(0, 5).map(([k, v]) => [`Pain · ${k}`, String(v)] as [string, string])]} />
        </div>

        <section aria-labelledby="funnel-title" className="mt-10">
          <h2 id="funnel-title" className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink/65 mb-2.5">Activation funnel, last {days} days</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="rounded-[22px] border border-border bg-white px-5 py-4">
              <ol className="space-y-1.5">
                {g.activationFunnel.map((st, i) => (
                  <li key={st.label} className="flex items-baseline gap-3 text-sm">
                    <span className="w-5 text-[11px] font-bold text-ink/55 tabular-nums">{i + 1}</span>
                    <span className="flex-1 text-ink/85">{st.label}</span>
                    <span className="font-extrabold text-ink tabular-nums">{st.n}</span>
                    <span className={cn("w-16 text-right text-[11px] tabular-nums", st.drop === null ? "text-ink/40" : st.drop >= 50 ? "text-danger-text font-semibold" : "text-ink/60")}>{st.drop === null ? "" : `−${st.drop}%`}</span>
                  </li>
                ))}
              </ol>
              <p className="mt-2 text-[11px] text-ink/65">Workspaces per step in the window; the drop is the share of the previous step that did not reach it.</p>
            </div>
            <Block title="Who converts, by what they said at setup" rows={g.personaConversion.length ? g.personaConversion.map((pc) => [`${pc.status} (${pc.n})`, `${pc.paid} paid · ${pc.rate}%`] as [string, string]) : [["No profiles in the window", "—"]]} />
          </div>
        </section>

        <section aria-labelledby="ai-title" className="mt-10">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 mb-2.5">
            <h2 id="ai-title" className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink/65">AI usage, last 24 hours</h2>
            <span className={cn("text-[11px] font-semibold", ai.state === "ready" ? "text-success-text" : ai.state === "disabled" ? "text-warning-text" : "text-ink/65")}>
              {ai.state === "ready" ? "Model configured and enabled" : ai.state === "disabled" ? "Switched off deliberately (AI_DISABLED)" : "No model configured (OPENAI_API_KEY unset)"}
            </span>
          </div>
          <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
            <Block title="Spend" rows={[["Estimated cost", formatCostMicros(ai.overall.costMicrosToday)], ["Calls", n(ai.overall.callsToday)], ["Calls this hour", n(ai.overall.callsThisHour)], ["Tokens", n(ai.overall.tokensToday)], ["Median latency", ai.overall.medianMs === null ? "—" : `${ai.overall.medianMs} ms`]]} />
            <Block title="Health" rows={[["Failed calls", n(ai.overall.failuresToday)], ["Refused by a limit", n(ai.overall.blockedToday)], ...(ai.overall.byErrorKind.length ? ai.overall.byErrorKind.map(([k, v]) => [`· ${k}`, String(v)] as [string, string]) : [["No failures recorded", "—"] as [string, string]])]} />
            <Block title="By feature" rows={ai.overall.byFeature.length ? ai.overall.byFeature.map(([k, v]) => [AI_FEATURE_LABEL[k as AiFeature] ?? k, String(v)] as [string, string]) : [["No calls yet", "—"]]} />
            <Block title="Limits per workspace" rows={[["Drafts", `${AI_RATE_LIMITS.draft!.limit}/hour`], ["Assistant proposals", `${AI_RATE_LIMITS.agent_draft!.limit}/hour`], ["Re-summaries", `${AI_RATE_LIMITS.summary_forced!.limit}/hour`], ["Assistant questions", `${ASSISTANT_HOURLY_LIMIT}/hour`], ["Message reading", `${AI_RATE_LIMITS.extraction!.limit}/day`], ["Every AI call", `${DAILY_CALL_CEILING.limit}/day`]]} />
          </div>
          {ai.byBusiness.length > 0 && (
            <div className="mt-4 overflow-x-auto rounded-[22px] border border-border bg-white">
              <table className="w-full text-sm">
                <thead className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink/65 text-left">
                  <tr>{["Workspace", "Calls", "This hour", "Tokens", "Est. cost", "Failed", "Refused", "By feature", "Last call"].map((h) => <th key={h} className="px-3 py-2.5 whitespace-nowrap">{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {ai.byBusiness.map((b) => (
                    <tr key={b.businessId} className="hover:bg-black/[0.02]">
                      <td className="px-3 py-2 whitespace-nowrap"><Link href={`/admin/growth?days=${days}&b=${b.handle}`} className="font-semibold text-ink hover:underline">{b.name}</Link></td>
                      <td className="px-3 py-2 tabular-nums">{b.usage.callsToday}</td>
                      <td className="px-3 py-2 tabular-nums">{b.usage.callsThisHour}</td>
                      <td className="px-3 py-2 tabular-nums">{b.usage.tokensToday}</td>
                      <td className="px-3 py-2 tabular-nums font-semibold">{formatCostMicros(b.usage.costMicrosToday)}</td>
                      <td className={cn("px-3 py-2 tabular-nums", b.usage.failuresToday > 0 && "text-danger-text font-semibold")}>{b.usage.failuresToday}</td>
                      <td className="px-3 py-2 tabular-nums">{b.usage.blockedToday}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-ink/70">{b.usage.byFeature.map(([k, v]) => `${k} ${v}`).join(", ") || "—"}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-ink/70">{b.usage.lastCallAt ? `${formatDistanceToNowStrict(b.usage.lastCallAt)} ago` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-2 text-[11px] text-ink/65">Cost is an estimate from the published price list in <code>lib/aiPolicy.ts</code>, applied to the tokens each call actually reported. No prompt, message or customer detail is recorded with a call.</p>
        </section>

        {detail && (
          <section aria-labelledby="detail-title" className="mt-10 rounded-[22px] border border-signal/25 bg-white overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex flex-wrap items-baseline justify-between gap-3">
              <h2 id="detail-title" className="font-sans font-extrabold text-xl tracking-[-0.02em] text-ink">{detail.name} <span className="text-ink/60 font-semibold text-sm">/{detail.handle}</span></h2>
              <Link href={`/admin/growth?days=${days}`} className="text-xs font-semibold text-ink/65 hover:text-ink">Close ×</Link>
            </div>
            <div className="grid md:grid-cols-3 gap-px bg-border">
              <div className="bg-white px-5 py-4 text-sm space-y-1.5">
                <p><span className="text-ink/60">Started</span> {format(detail.createdAt, "MMM d, yyyy")} · {formatDistanceToNowStrict(detail.createdAt)} ago</p>
                <p><span className="text-ink/60">Plan</span> {detail.planTier}{detail.billingStatus ? ` · ${detail.billingStatus}` : ""}{detail.trialEndsAt ? ` · trial ends ${format(detail.trialEndsAt, "MMM d")}` : ""}</p>
                <p><span className="text-ink/60">Onboarding</span> {detail.onboardingComplete ? "complete" : "not finished"} · {detail.timezone}</p>
                <p><span className="text-ink/60">People</span> {detail.orgMemberships.map((m) => `${m.user.name} (${m.role.toLowerCase()})`).join(", ")}</p>
                <p><span className="text-ink/60">Referral</span> code {detail.referralCode ?? "—"} · referred {detail.referredCount} · {detail.referredById ? "came from a link" : "direct"}</p>
                {detail.onboardingProfile && <p><span className="text-ink/60">Said</span> {detail.onboardingProfile.userType} · {detail.onboardingProfile.workCategory}{detail.onboardingProfile.workDetail ? ` (${detail.onboardingProfile.workDetail})` : ""} · {detail.onboardingProfile.businessStatus} · channels {detail.onboardingProfile.channels.join(", ") || "—"} · pain {detail.onboardingProfile.painPoints.join(", ") || "—"} · wants {detail.onboardingProfile.desiredFeatures.join(", ") || "—"} · bookings {detail.onboardingProfile.bookings} · team {detail.onboardingProfile.teamUsage} · recommended {detail.onboardingProfile.recommendedPlan}{detail.onboardingProfile.selectedPlan ? ` · chose ${detail.onboardingProfile.selectedPlan}` : ""}</p>}
              </div>
              <div className="bg-white px-5 py-4 text-sm space-y-1.5">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink/65">Channels</p>
                {detail.integrations.length === 0 ? <p className="text-ink/60">Nothing connected yet.</p> : detail.integrations.map((i) => (
                  <p key={i.provider}><span className="font-semibold text-ink">{i.provider}</span> · {i.status}{i.wanted && i.status === "NOT_CONNECTED" ? " · wanted" : ""}{i.lastSyncedAt ? ` · synced ${formatDistanceToNowStrict(i.lastSyncedAt)} ago` : ""}{i.lastSyncStatus ? ` · ${i.lastSyncStatus}` : ""}{i.lastErrorAt ? ` · error ${formatDistanceToNowStrict(i.lastErrorAt)} ago` : ""}</p>
                ))}
                <p className="pt-2 text-[11px] font-bold uppercase tracking-[0.14em] text-ink/65">Work</p>
                <p>{detail._count.conversations} conversations · {detail._count.clients} people · {detail._count.leads} leads ({detail.leadsByStatus.map(([s, c]) => `${c} ${s.toLowerCase()}`).join(", ") || "none"})</p>
                <p>{detail._count.bookings} bookings · {detail.services.length} services · {detail.automations.filter((a) => a.enabled).length}/{detail.automations.length} automations on · {detail.automationRuns} runs</p>
                <p>{detail.followUpsSet} follow-ups set · needs attention now: {detail.attentionNow.length}</p>
                <p className="pt-2 text-[11px] font-bold uppercase tracking-[0.14em] text-ink/65">Inbox intelligence</p>
                <p>Conversations by kind: {detail.conversationsByCategory.map(([k, c]) => `${c} ${k.toLowerCase()}`).join(", ") || "none"}</p>
                <p>{detail.peopleWithConversation} people with a real conversation · {detail.potentialClients} potential clients · {detail.messageSummaries} message summaries</p>
                {detail.attentionNow.slice(0, 5).map((a, i) => <p key={i} className="text-xs text-ink/70">· {a.label} — {a.why}</p>)}
              </div>
              <div className="bg-white px-5 py-4 text-sm">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink/65">What they use</p>
                <ul className="mt-1.5 space-y-0.5">{detail.eventTotals.slice(0, 14).map(([name, c]) => <li key={name} className="flex justify-between gap-3 tabular-nums"><span className="text-ink/80">{name}</span><span className="font-semibold text-ink">{c}</span></li>)}</ul>
              </div>
            </div>
            <div className="px-5 py-4 border-t border-border">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink/65 mb-2">Timeline (latest 80)</p>
              <ol tabIndex={0} aria-label="Timeline" className="max-h-72 overflow-y-auto text-xs space-y-0.5 tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 rounded-md">
                {detail.events.map((e, i) => <li key={i} className="flex gap-3"><span className="text-ink/60 shrink-0 w-32">{format(e.at, "MMM d HH:mm")}</span><span className="font-semibold text-ink">{e.name}</span><span className="text-ink/60 truncate">{e.props}</span></li>)}
              </ol>
            </div>
          </section>
        )}

        <section aria-labelledby="biz-title" className="mt-10">
          <h2 id="biz-title" className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink/65 mb-2.5">Workspaces, newest first</h2>
          <div className="overflow-x-auto rounded-[22px] border border-border bg-white">
            <table className="w-full text-sm">
              <thead className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink/65 text-left">
                <tr>{["Workspace", "Owner", "Plan", "Started", "Said", "Channels", "Conv.", "Bookings", "Auto.", "Last activity", "Referred by"].map((h) => <th key={h} className="px-3 py-2.5 whitespace-nowrap">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-border">
                {businesses.map((b) => (
                  <tr key={b.id} className="hover:bg-black/[0.02]">
                    <td className="px-3 py-2 whitespace-nowrap"><Link href={`/admin/growth?days=${days}&b=${b.handle}`} className="font-semibold text-ink hover:underline">{b.name}</Link></td>
                    <td className="px-3 py-2 whitespace-nowrap text-ink/70">{b.owner ?? "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{b.plan}{b.billingStatus ? <span className="text-ink/60"> · {b.billingStatus.toLowerCase()}</span> : null}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-ink/70">{format(b.createdAt, "MMM d")}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-ink/70">{b.persona ?? "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-ink/70">{b.channels.join(", ") || "—"}</td>
                    <td className="px-3 py-2 tabular-nums">{b.conversations}</td>
                    <td className="px-3 py-2 tabular-nums">{b.bookings}</td>
                    <td className="px-3 py-2 tabular-nums">{b.automationsOn}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-ink/70">{b.lastActivity ? `${formatDistanceToNowStrict(b.lastActivity)} ago` : "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-ink/70">{b.referredBy ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] text-ink/65">The owner&rsquo;s address is shown so you can reach a design partner; no message content, phone numbers or customer details appear anywhere on this page.</p>
        </section>
      </div>
    </main>
  );
}

function Block({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <section aria-label={title} className="rounded-[22px] border border-border bg-white px-5 py-4">
      <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink/65">{title}</h2>
      <dl className="mt-2.5 space-y-1">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-3 text-sm">
            <dt className="text-ink/75">{k}</dt>
            <dd className="font-extrabold text-ink tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
