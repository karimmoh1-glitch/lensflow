import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { googleOAuthConfigured } from "@/lib/google";
import { instagramConfigured } from "@/lib/meta/instagram";
import { whatsappConfigured } from "@/lib/meta/whatsapp";
import { twilioConfigured } from "@/lib/twilio";
import { subscriptionBillingIsLive } from "@/lib/subscriptionBilling";
import { LogoMark } from "@/components/Logo";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Status", description: "Whether Daythread is up, and which channels are configured on this deployment." };
export const dynamic = "force-dynamic";

/**
 * An honest status page. Two things Daythread can actually verify at request time: that
 * the app answered (you are reading it) and that its database answers. For every provider
 * it can only say whether the connection is configured on this deployment — Daythread does
 * not monitor Gmail, Meta, Twilio or Stripe themselves, so each row links to the provider's
 * own status page rather than guessing.
 */
async function databaseReachable(): Promise<boolean> {
  try {
    await Promise.race([prisma.$queryRaw`SELECT 1`, new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 3000))]);
    return true;
  } catch {
    return false;
  }
}

export default async function StatusPage() {
  const db = await databaseReachable();
  const checkedAt = new Date();
  const google = googleOAuthConfigured();
  const core = [
    { name: "Daythread app", ok: true, note: "Answering — this page was built by it just now." },
    { name: "Inbox, calendar, bookings, people, automations", ok: db, note: db ? "Database answering." : "The database didn't answer within three seconds. Signed-in pages may fail until it does." },
    { name: "Assistant", ok: db, note: db ? (process.env.OPENAI_API_KEY ? "Answers from your records, written by the model." : "Answers from your records by rules; no language model is configured on this deployment.") : "Depends on the database." },
  ];
  const providers = [
    { name: "Gmail", configured: google, status: "https://www.google.com/appsstatus/dashboard/" },
    { name: "Google Calendar", configured: google, status: "https://www.google.com/appsstatus/dashboard/" },
    { name: "Instagram", configured: instagramConfigured(), status: "https://metastatus.com/" },
    { name: "WhatsApp", configured: whatsappConfigured(), status: "https://metastatus.com/whatsapp-business-api" },
    { name: "SMS", configured: twilioConfigured(), status: "https://status.twilio.com/" },
    { name: "Apple Calendar", configured: true, status: "https://www.apple.com/support/systemstatus/", note: "Connects with an app-specific password; nothing to configure on Daythread's side." },
    { name: "Subscription billing", configured: subscriptionBillingIsLive, status: "https://status.stripe.com/" },
  ];

  return (
    <main className="min-h-screen bg-paper">
      <div className="max-w-2xl mx-auto px-6 py-12 md:py-16">
        <Link href="/" className="inline-flex items-center gap-2 text-ink"><LogoMark className="w-6 h-6" /><span className="font-sans font-extrabold text-lg tracking-tight">Daythread</span></Link>
        <h1 className="mt-8 font-sans font-extrabold text-3xl tracking-tight text-ink">Status</h1>
        <p className="mt-2 text-sm text-ink/70">Checked when you opened this page, at {checkedAt.toUTCString()}.</p>

        <section aria-label="Daythread" className="mt-8 rounded-[20px] border border-border bg-white divide-y divide-border">
          {core.map((row) => (
            <div key={row.name} className="flex items-start gap-3 px-5 py-4">
              <span aria-hidden className={cn("mt-1.5 w-2.5 h-2.5 rounded-full shrink-0", row.ok ? "bg-success" : "bg-danger")} />
              <div className="min-w-0">
                <div className="text-sm font-semibold text-ink">{row.name} <span className={cn("ml-1 text-xs font-bold", row.ok ? "text-success-text" : "text-danger-text")}>{row.ok ? "Up" : "Down"}</span></div>
                <p className="text-xs text-ink/70 mt-0.5">{row.note}</p>
              </div>
            </div>
          ))}
        </section>

        <h2 className="mt-10 text-[11px] font-bold uppercase tracking-[0.14em] text-ink/65">Channels and services</h2>
        <p className="mt-2 text-sm text-ink/70">Daythread doesn&rsquo;t monitor these providers&rsquo; uptime. Each row says whether the connection is configured on this deployment, and links to the provider&rsquo;s own status page.</p>
        <section aria-label="Providers" className="mt-4 rounded-[20px] border border-border bg-white divide-y divide-border">
          {providers.map((p) => (
            <div key={p.name} className="flex items-start gap-3 px-5 py-4">
              <span aria-hidden className={cn("mt-1.5 w-2.5 h-2.5 rounded-full shrink-0", p.configured ? "bg-success" : "bg-ink/25")} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-ink">{p.name} <span className={cn("ml-1 text-xs font-bold", p.configured ? "text-success-text" : "text-ink/65")}>{p.configured ? "Configured" : "Not configured"}</span></div>
                <p className="text-xs text-ink/70 mt-0.5">{"note" in p && p.note ? p.note : p.configured ? "Connections can be made from Settings → Channels." : "Not available on this deployment yet; the app says so wherever it would be offered."}</p>
              </div>
              <a href={p.status} target="_blank" rel="noreferrer" className="text-xs font-semibold text-ink/70 hover:text-ink whitespace-nowrap">Provider status ↗</a>
            </div>
          ))}
        </section>

        <p className="mt-8 text-xs text-ink/65">Something wrong that this page doesn&rsquo;t show? Email <a href="mailto:support@daythread.org" className="font-semibold text-ink">support@daythread.org</a>.</p>
      </div>
    </main>
  );
}
