import { redirect } from "next/navigation";
import Link from "next/link";
import { requireBusiness } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PROVIDERS, providerConfigured } from "@/lib/integrations/registry";
import { tokenCryptoConfigured } from "@/lib/tokenCrypto";
import { connectGoogle } from "@/app/actions/googleAuth";
import { connectInstagram, connectWhatsApp } from "@/app/actions/connect";
import { ChannelIcon, type ChannelKey } from "@/app/landing/ChannelIcon";
import { CalendarDays, Apple, ArrowRight } from "lucide-react";
import { Toaster } from "@/components/Toaster";
import { OnboardingAppleConnect } from "./OnboardingAppleConnect";
import type { IntegrationProvider } from "@prisma/client";

/**
 * Right after onboarding: connect the tools the owner said they use. Each button starts the
 * provider's real authorization; "Skip for now" keeps the row as wanted-but-not-connected.
 * Nothing here is ever marked connected without the provider's say-so.
 */
export default async function OnboardingConnectPage() {
  const ctx = await requireBusiness();
  if (!ctx) redirect("/login");
  if (ctx.role !== "OWNER" && ctx.role !== "ADMIN") redirect("/dashboard");
  const rows = await prisma.integration.findMany({ where: { businessId: ctx.business.id, wanted: true } });
  const pending = rows.filter((r) => r.status === "NOT_CONNECTED");
  if (pending.length === 0) redirect("/dashboard");
  const encryptionOk = process.env.NODE_ENV !== "production" || tokenCryptoConfigured();
  const ICON: Partial<Record<IntegrationProvider, ChannelKey>> = { EMAIL: "gmail", SMS: "sms", INSTAGRAM: "instagram", WHATSAPP: "whatsapp" };

  return (
    <Toaster>
      <main className="min-h-screen bg-paper">
        <div className="max-w-xl mx-auto px-6 py-14">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-signal-text">Almost there</p>
          <h1 className="mt-2 font-sans font-extrabold text-[2rem] leading-[1.05] tracking-[-0.035em] text-ink">Connect the tools you use.</h1>
          <p className="mt-2 text-sm text-ink/60">Connect the calendar and channels you already use so Daythread can read your availability and start sorting what needs you. Each one uses the provider&rsquo;s own sign-in.</p>
          <ul className="mt-8 space-y-3">
            {pending.map((r) => {
              const spec = PROVIDERS[r.provider as keyof typeof PROVIDERS];
              if (!spec) return null;
              const configured = providerConfigured(spec) && (spec.auth !== "oauth" || encryptionOk);
              const icon = r.provider === "GOOGLE_CALENDAR" ? <CalendarDays className="w-5 h-5 text-[#4285F4]" strokeWidth={2} aria-hidden /> : r.provider === "APPLE_CALENDAR" ? <Apple className="w-5 h-5 text-ink" strokeWidth={2} aria-hidden /> : ICON[r.provider] ? <ChannelIcon k={ICON[r.provider]!} size={24} /> : null;
              const action = r.provider === "EMAIL" ? gmail : r.provider === "GOOGLE_CALENDAR" ? gcal : r.provider === "INSTAGRAM" ? ig : r.provider === "WHATSAPP" ? wa : null;
              return (
                <li key={r.id} className="rounded-[22px] border border-border bg-white px-5 py-4 flex items-center gap-4">
                  <span className="w-10 h-10 rounded-xl border border-border bg-paper flex items-center justify-center shrink-0">{icon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-ink">{spec.name}</div>
                    <div className="text-xs text-ink/55 leading-snug">{spec.summary}</div>
                    {!configured && r.provider !== "APPLE_CALENDAR" && <div className="text-[11px] text-ink/45 mt-0.5">Not available on Daythread yet — you can connect it later from Settings.</div>}
                  </div>
                  {r.provider === "APPLE_CALENDAR" ? (
                    <OnboardingAppleConnect />
                  ) : action && configured ? (
                    <form action={action}><button type="submit" className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full bg-ink text-white text-sm font-extrabold hover:bg-graphite active:scale-[0.98] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50">Connect <ArrowRight className="w-3.5 h-3.5" strokeWidth={2.5} aria-hidden /></button></form>
                  ) : null}
                </li>
              );
            })}
          </ul>
          <div className="mt-8 flex items-center gap-4">
            <Link href="/dashboard" className="text-sm font-semibold text-ink/55 hover:text-ink">Skip for now →</Link>
            <span className="text-[11px] text-ink/40">You can connect any of these later from Settings → Integrations.</span>
          </div>
        </div>
      </main>
    </Toaster>
  );
}

async function gmail() {
  "use server";
  await connectGoogle("gmail");
}
async function gcal() {
  "use server";
  await connectGoogle("calendar");
}
async function ig() {
  "use server";
  await connectInstagram();
}
async function wa() {
  "use server";
  await connectWhatsApp();
}
