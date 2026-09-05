import { redirect } from "next/navigation";
import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { PLANS } from "@/lib/billing";
import { formatMoney, cn } from "@/lib/utils";
import { probeStripe, LOOKUP_KEYS } from "@/lib/subscriptionBilling";
import { formatDistanceToNowStrict } from "date-fns";

/**
 * Daythread's operator sets Stripe up once, here. Customers never see this: they choose a
 * plan and pay through Stripe-hosted Checkout. This page reports whether each variable is
 * present and whether the key and webhook actually work — it never shows a value and has
 * nowhere to type one.
 */
export default async function BillingSetupPage() {
  const ctx = await requireRole(["OWNER"]);
  if (!ctx) redirect("/dashboard/billing");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://daythread.org";
  const [probe, lastWebhook] = await Promise.all([probeStripe(), prisma.webhookEvent.findFirst({ where: { provider: "stripe" }, orderBy: { receivedAt: "desc" } })]);

  type Status = "connected" | "missing" | "invalid" | "unverified";
  const keyStatus: Status = !process.env.STRIPE_SECRET_KEY ? "missing" : probe.ok ? "connected" : "invalid";
  const webhookStatus: Status = !process.env.STRIPE_WEBHOOK_SECRET ? "missing" : lastWebhook ? "connected" : "unverified";
  const urlStatus: Status = process.env.NEXT_PUBLIC_APP_URL ? "connected" : "missing";
  const cronStatus: Status = process.env.CRON_SECRET ? "connected" : "missing";

  const vars: Array<{ name: string; required: boolean; status: Status; where: string; does: string; detail?: string }> = [
    { name: "STRIPE_SECRET_KEY", required: true, status: keyStatus, where: "Stripe Dashboard → Developers → API keys → Secret key", does: "Creates customers, prices, checkouts, the portal, and reads invoices. Server-only.", detail: probe.ok ? `Connected to ${probe.accountLabel ?? "your account"} · ${probe.mode ?? "unknown"} mode` : probe.error === "missing" ? undefined : `Stripe rejected the key: ${probe.error}` },
    { name: "STRIPE_WEBHOOK_SECRET", required: true, status: webhookStatus, where: `Developers → Webhooks → Add endpoint ${appUrl}/api/webhooks/stripe → Signing secret`, does: "Verifies that events really come from Stripe. Without it nothing can change a plan or mark a payment paid.", detail: webhookStatus === "missing" ? undefined : lastWebhook ? `Last verified event ${formatDistanceToNowStrict(lastWebhook.receivedAt)} ago` : "Secret is set; no verified event has arrived yet — send a test event from the Stripe Dashboard" },
    { name: "NEXT_PUBLIC_APP_URL", required: true, status: urlStatus, where: "Vercel → Settings → Environment Variables", does: "Where Stripe sends people back after checkout and the portal.", detail: process.env.NEXT_PUBLIC_APP_URL },
    { name: "CRON_SECRET", required: false, status: cronStatus, where: "Vercel → Settings → Environment Variables (any random string)", does: "Lets the daily automation sweep run. Not part of billing." },
  ];
  const ready = keyStatus === "connected" && webhookStatus !== "missing" && urlStatus === "connected";

  const events = ["checkout.session.completed", "checkout.session.async_payment_succeeded", "checkout.session.async_payment_failed", "customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted", "invoice.paid", "invoice.payment_failed"];

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-8 py-6 md:py-10">
      <Link href="/dashboard/billing" className="text-xs font-semibold text-ink/55 hover:text-ink">← Billing</Link>
      <div className="mt-3">
        <PageHeader title="Stripe setup" description="Owner only. Your customers never see keys — they choose a plan and pay through Stripe Checkout." />
      </div>

      <div className={cn("rounded-2xl border px-5 py-4 mb-6 text-sm", ready ? "border-success/30 bg-success-soft/50 text-success-text" : "border-border bg-white text-ink/70")}>
        {ready ? (
          <>Stripe is connected{probe.mode === "test" ? " in test mode — switch to live keys when you're ready to charge real cards" : " in live mode"}. Checkout, the portal and webhooks are on.</>
        ) : (
          <>Stripe isn&rsquo;t connected yet. Nothing is charged until every required variable is present and verified.</>
        )}
      </div>

      <section aria-label="Variables" className="rounded-[22px] border border-border bg-white overflow-hidden mb-8">
        <ul className="divide-y divide-border">
          {vars.map((v) => (
            <li key={v.name} className="px-5 py-4 flex gap-4">
              <StatusDot status={v.status} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <code className="text-[12px] font-semibold text-ink">{v.name}</code>
                  <span className={cn("text-[10px] font-bold uppercase tracking-[0.12em] rounded-full px-2 py-0.5", v.status === "connected" ? "bg-success-soft text-success-text" : v.status === "invalid" ? "bg-danger-soft text-danger-text" : v.status === "unverified" ? "bg-warning-soft text-warning-text" : "bg-black/[0.05] text-ink/55")}>{label(v.status)}</span>
                  {!v.required && <span className="text-[10px] text-ink/40">optional</span>}
                </div>
                <p className="mt-1 text-sm text-ink/70">{v.does}</p>
                <p className="mt-1 text-xs text-ink/50">Where: {v.where}</p>
                {v.detail && <p className={cn("mt-1 text-xs", v.status === "invalid" ? "text-danger-text" : "text-ink/60")}>{v.detail}</p>}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Steps" className="space-y-3">
        {[
          { t: "Add the secret key in Vercel and redeploy", b: "Test mode first (sk_test_…). The status above turns to Connected when Stripe accepts it." },
          { t: "Prices and products are created for you", b: `On the first upgrade click Daythread finds or creates ${formatMoney(PLANS.PRO.priceCents)}/mo and ${formatMoney(PLANS.BUSINESS.priceCents)}/mo by lookup key (${LOOKUP_KEYS.PRO}, ${LOOKUP_KEYS.BUSINESS}). If a price ever changes here, the old Stripe price is archived and replaced — nothing can charge a stale amount.` },
          { t: "Add the webhook endpoint", b: `${appUrl}/api/webhooks/stripe, subscribed to: ${events.join(", ")}. Paste the signing secret as STRIPE_WEBHOOK_SECRET and redeploy.` },
          { t: "Send a test event", b: "Developers → Webhooks → your endpoint → Send test event. The webhook row above shows the time of the last verified event." },
          { t: "Run a test purchase", b: "Billing → Upgrade to Pro → card 4242 4242 4242 4242. The plan flips within seconds via the webhook; Manage billing opens the Stripe portal (card, invoices, plan switch, cancel)." },
          { t: "Go live", b: "Swap to sk_live_… and a live-mode webhook secret, redeploy, and repeat the test purchase with a real card once." },
        ].map((s, i) => (
          <div key={s.t} className="rounded-2xl border border-border bg-white px-5 py-4 flex gap-4">
            <span className="w-7 h-7 rounded-full bg-black/[0.05] text-ink/60 text-xs font-extrabold flex items-center justify-center shrink-0">{i + 1}</span>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-ink">{s.t}</div>
              <p className="mt-1 text-sm text-ink/65 leading-relaxed break-words">{s.b}</p>
            </div>
          </div>
        ))}
      </section>

      <p className="mt-8 text-xs text-ink/45">
        Client deposits and balances (your customers paying you) use the same Stripe account and webhook, but are a separate thing from this subscription: they attach to bookings and show up under Payments, marked paid only when Stripe confirms.
      </p>
    </div>
  );
}

function StatusDot({ status }: { status: "connected" | "missing" | "invalid" | "unverified" }) {
  return <span aria-hidden className={cn("mt-1.5 w-2.5 h-2.5 rounded-full shrink-0", status === "connected" ? "bg-success" : status === "invalid" ? "bg-danger" : status === "unverified" ? "bg-warning" : "bg-ink/20")} />;
}
function label(s: "connected" | "missing" | "invalid" | "unverified") {
  return { connected: "Connected", missing: "Missing", invalid: "Invalid", unverified: "Webhook not verified" }[s];
}
