import type { Metadata } from "next";
import Link from "next/link";
import { LogoMark } from "@/components/Logo";

export const metadata: Metadata = { title: "Support", description: "How to reach Daythread, what to include, and what we can help with." };

/** A real support page: who to write to, what to include, and the self-serve answers that
 * cover most questions. Linked from the app, the App Store listing and the legal pages. */
export default function SupportPage() {
  const email = "support@daythread.org";
  return (
    <main className="min-h-screen bg-paper">
      <div className="max-w-2xl mx-auto px-6 py-14 md:py-20">
        <Link href="/" className="inline-flex items-center gap-2 text-ink"><LogoMark className="w-5 h-5" /><span className="font-sans font-extrabold text-[17px] tracking-tight">Daythread</span></Link>
        <h1 className="mt-8 font-sans font-black text-[2rem] md:text-[2.5rem] leading-[1.05] tracking-[-0.03em] text-ink">Support</h1>
        <p className="mt-3 text-base text-ink/65 leading-relaxed">Write to <a href={`mailto:${email}`} className="font-semibold text-ink underline decoration-ink/30 underline-offset-4">{email}</a>. A person reads every message; most get an answer within one business day.</p>

        <section className="mt-10 space-y-6">
          {[
            ["Something didn't send", "Open the conversation: every outbound message shows whether it was sent, delivered, failed or not delivered, with the reason. \"Not delivered\" means that channel isn't connected for your workspace yet — connect it under Settings → Integrations. Nothing is ever shown as sent unless the provider confirmed it."],
            ["An integration needs attention", "Google, Instagram and WhatsApp revoke access from time to time. Settings → Integrations shows which one and offers Reconnect. Reconnecting never deletes conversations or bookings."],
            ["Billing", "Your plan, next charge, card and invoices live under Billing, all read from Stripe. Cancel any time from Manage billing; your plan stays on until the period ends. Downgrading never deletes anything."],
            ["Plan limits", "Free includes 2 connected integrations, 3 automations and 1 team member. Pro includes 6 integrations, unlimited automations and 3 team members. Business is unlimited and adds the Business Agent."],
            ["Delete your account", "Settings → Profile → Delete workspace removes the business, its conversations, clients, bookings and connected credentials. This is immediate and cannot be undone."],
            ["Security", "Credentials for connected accounts are encrypted at rest and never shown in the app. Report a security concern to the address above with \"security\" in the subject."],
          ].map(([h, p]) => (
            <div key={h} className="rounded-2xl border border-border bg-white px-5 py-4">
              <h2 className="text-sm font-semibold text-ink">{h}</h2>
              <p className="mt-1 text-sm text-ink/65 leading-relaxed">{p}</p>
            </div>
          ))}
        </section>

        <p className="mt-10 text-xs text-ink/45">When you write, include the workspace name and, for a message problem, the client&rsquo;s name and the time it happened. <Link href="/privacy" className="underline">Privacy</Link> · <Link href="/terms" className="underline">Terms</Link></p>
      </div>
    </main>
  );
}
