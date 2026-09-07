import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Terms — Daythread", description: "The terms for using Daythread." };

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-paper">
      <div className="max-w-2xl mx-auto px-6 py-16">
        <Link href="/" className="text-xs font-semibold text-ink/50 hover:text-ink">← Daythread</Link>
        <h1 className="mt-4 font-sans font-extrabold text-3xl tracking-[-0.03em] text-ink">Terms of service</h1>
        <p className="mt-2 text-sm text-ink/55">Last updated September 6, 2026</p>
        {[
          ["The service", "Daythread is a unified inbox: it connects the messaging accounts you choose and organizes what arrives into conversations you can read and answer in one place. You keep ownership of your data and your contacts' data; you grant Daythread the right to process it to provide the service."],
          ["Your accounts and connections", "You are responsible for the accounts you connect and for having the right to connect them. Connections use each provider's official authorization and are subject to that provider's terms (Google, Meta, Twilio). A provider may limit or revoke access; Daythread shows that state honestly and never pretends a message was sent when it wasn't."],
          ["Messaging rules", "You agree to message customers only where you have their consent and in line with the channel's policies — for example WhatsApp's 24-hour customer-service window and template rules, and applicable SMS regulations. Daythread refuses sends it knows a provider will reject."],
          ["Plans and billing", "Free and Pro ($20 per month) are the only plans. Pro is billed monthly through Stripe. You can change or cancel any time from Settings → Subscription; cancellation takes effect at the end of the paid period. Failed payments keep Pro active while Stripe retries; a lapsed subscription returns the inbox to Free without deleting data. Daythread does not process payments between you and the people who write to you."],
          ["Acceptable use", "Do not use Daythread to send unsolicited messages, to access accounts you don't control, or to store data you have no right to process."],
          ["Deleting your inbox", "You can delete your inbox at any time from Settings → Profile; deletion is permanent and covers everything described in the Privacy page."],
          ["Availability and liability", "Daythread is provided as is. We work to keep it available and accurate, but connected providers can change or fail, and Daythread is not liable for messages a provider does not deliver or for indirect damages. Our total liability is limited to the fees you paid in the previous three months."],
          ["Changes", "We may update these terms; material changes are announced in the product before they take effect."],
          ["Contact", "hello@daythread.org"],
        ].map(([t, b]) => (
          <section key={t} className="mt-8">
            <h2 className="text-sm font-bold uppercase tracking-[0.12em] text-ink/50">{t}</h2>
            <p className="mt-2 text-[15px] leading-relaxed text-ink/80">{b}</p>
          </section>
        ))}
      </div>
    </main>
  );
}
