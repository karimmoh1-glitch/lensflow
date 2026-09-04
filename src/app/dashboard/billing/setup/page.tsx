import { redirect } from "next/navigation";
import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { PLANS } from "@/lib/billing";
import { formatMoney, cn } from "@/lib/utils";

/**
 * The owner's setup guide for Daythread's own billing. Customers never see this — they get
 * Stripe-hosted Checkout and the Billing Portal. This page only reports whether each
 * environment variable is present; it never shows a value and there is nowhere to type one.
 */
export default async function BillingSetupPage() {
  const ctx = await requireRole(["OWNER"]);
  if (!ctx) redirect("/dashboard/billing");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://your-domain";
  const env = {
    STRIPE_SECRET_KEY: Boolean(process.env.STRIPE_SECRET_KEY),
    STRIPE_WEBHOOK_SECRET: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
    NEXT_PUBLIC_APP_URL: Boolean(process.env.NEXT_PUBLIC_APP_URL),
    CRON_SECRET: Boolean(process.env.CRON_SECRET),
  };
  const ready = env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET && env.NEXT_PUBLIC_APP_URL;

  const steps: Array<{ title: string; body: React.ReactNode; done?: boolean }> = [
    {
      title: "Create a Stripe account",
      body: <>Sign up at stripe.com and complete business verification. Test mode works for everything below until you flip to live keys.</>,
    },
    {
      title: "Products and prices are created for you",
      body: (
        <>
          On the first upgrade click, Daythread looks up prices by lookup key (<code className="text-[11px] bg-black/[0.05] px-1 rounded">daythread_pro_monthly</code>, <code className="text-[11px] bg-black/[0.05] px-1 rounded">daythread_business_monthly</code>) and creates the products if they don&rsquo;t exist —{" "}
          {formatMoney(PLANS.PRO.priceCents)}/mo and {formatMoney(PLANS.BUSINESS.priceCents)}/mo. If you change a price here later, archive the old Stripe price so the lookup creates the new one.
        </>
      ),
    },
    {
      title: "Add the secret key",
      body: <>In Vercel → Project → Settings → Environment Variables, add <code className="text-[11px] bg-black/[0.05] px-1 rounded">STRIPE_SECRET_KEY</code> (Developers → API keys). Never paste it anywhere else, and never into source code.</>,
      done: env.STRIPE_SECRET_KEY,
    },
    {
      title: "Configure the webhook",
      body: (
        <>
          Developers → Webhooks → Add endpoint: <code className="text-[11px] bg-black/[0.05] px-1 rounded break-all">{appUrl}/api/webhooks/stripe</code>. Subscribe to{" "}
          <code className="text-[11px] bg-black/[0.05] px-1 rounded">checkout.session.completed</code>, <code className="text-[11px] bg-black/[0.05] px-1 rounded">checkout.session.async_payment_succeeded</code>,{" "}
          <code className="text-[11px] bg-black/[0.05] px-1 rounded">checkout.session.async_payment_failed</code>, <code className="text-[11px] bg-black/[0.05] px-1 rounded">customer.subscription.created / updated / deleted</code> and{" "}
          <code className="text-[11px] bg-black/[0.05] px-1 rounded">invoice.payment_failed</code>. Copy the signing secret into <code className="text-[11px] bg-black/[0.05] px-1 rounded">STRIPE_WEBHOOK_SECRET</code>.
        </>
      ),
      done: env.STRIPE_WEBHOOK_SECRET,
    },
    {
      title: "Verify the connection",
      body: <>Redeploy. This page turns green below, Billing stops saying &ldquo;not open yet,&rdquo; and the Settings → Connections card shows Stripe as connected.</>,
      done: ready,
    },
    {
      title: "Run a test purchase",
      body: <>In test mode, click Upgrade to Pro on Billing and pay with card 4242 4242 4242 4242. Within seconds the webhook sets the plan to Pro; Manage billing opens the Stripe Portal where cancellation and card changes are handled by Stripe. Then switch to live keys.</>,
    },
  ];

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-8 py-6 md:py-10">
      <Link href="/dashboard/billing" className="text-xs font-semibold text-ink/55 hover:text-ink">← Billing</Link>
      <div className="mt-3">
        <PageHeader title="Billing setup" description="Owner only. Customers never see keys — they get Stripe-hosted checkout and the billing portal." />
      </div>

      <div className={cn("rounded-2xl border px-4 py-3 mb-8 text-sm", ready ? "border-success/30 bg-success-soft/50 text-success-text" : "border-border bg-white text-ink/70")}>
        {ready ? "Stripe is configured on this deployment. Upgrades, the portal and webhooks are live." : "Stripe isn't configured yet. Nothing is charged until it is."}
        <dl className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          {Object.entries(env).map(([k, v]) => (
            <div key={k} className="flex items-center gap-1.5">
              <span className={cn("w-1.5 h-1.5 rounded-full", v ? "bg-success" : "bg-ink/25")} />
              <dt className="font-mono text-[10px] text-ink/60">{k}</dt>
              <dd className="sr-only">{v ? "present" : "missing"}</dd>
            </div>
          ))}
        </dl>
        {!env.CRON_SECRET && <p className="mt-2 text-xs text-ink/55">Also add <code className="text-[11px] bg-black/[0.05] px-1 rounded">CRON_SECRET</code> so the hourly automation sweep can run (Vercel Cron sends it automatically).</p>}
      </div>

      <ol className="space-y-3">
        {steps.map((st, i) => (
          <li key={st.title} className="rounded-2xl border border-border bg-white px-5 py-4 flex gap-4">
            <span className={cn("w-7 h-7 rounded-full flex items-center justify-center text-xs font-extrabold shrink-0", st.done ? "bg-success text-white" : "bg-black/[0.05] text-ink/60")}>{st.done ? "✓" : i + 1}</span>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-ink">{st.title}</div>
              <p className="mt-1 text-sm text-ink/65 leading-relaxed">{st.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <p className="mt-8 text-xs text-ink/45">
        What&rsquo;s already built: Checkout sessions, in-place plan changes with proration, the Billing Portal, signature-verified and idempotent webhooks, subscription state synced to the database, server-side entitlements that fall back to Free when a subscription lapses, failed-payment email to the owner, and card deposits from your own clients marked paid by the same webhook.
      </p>
    </div>
  );
}
