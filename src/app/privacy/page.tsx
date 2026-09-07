import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy — Daythread", description: "What Daythread collects, why, and how to delete it." };

/**
 * Written to match what the code actually does. When the implementation changes, this page
 * changes with it — it is not boilerplate.
 */
export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-paper">
      <div className="max-w-2xl mx-auto px-6 py-16 prose-sm">
        <Link href="/" className="text-xs font-semibold text-ink/50 hover:text-ink">← Daythread</Link>
        <h1 className="mt-4 font-sans font-extrabold text-3xl tracking-[-0.03em] text-ink">Privacy</h1>
        <p className="mt-2 text-sm text-ink/55">Last updated September 6, 2026</p>

        <Section title="What Daythread is">
          Daythread is a unified inbox: it connects the accounts you choose (Gmail, Instagram, WhatsApp, a text number, a contact form) and turns what arrives into conversations you can read and answer in one place. The person or team that creates an inbox is the controller of the contact data inside it; Daythread processes that data on their behalf.
        </Section>

        <Section title="Connected accounts">
          You connect accounts through each provider&rsquo;s own authorization screen (Google, Meta). Daythread stores the resulting access credentials encrypted at rest and uses them only to do what you asked: read and send messages on the connected channel. Daythread never asks for, stores, or sees your provider account password. Disconnecting an account erases the stored credential, revokes the grant with the provider where the provider supports it (Google), and stops all future access and sync immediately.
          <p className="mt-2">Gmail: with the scopes you approve, Daythread reads your inbox and sends replies from your address. Daythread&rsquo;s use of Google user data complies with the Google API Services User Data Policy, including the Limited Use requirements: Gmail data is used only to provide the inbox features you see, is never used for advertising, and is never sold or transferred to third parties except as needed to provide the service (for example, an AI model when you use an AI feature, see below).</p>
        </Section>

        <Section title="Messages and contacts">
          Daythread stores the messages that arrive on connected channels and the people who sent them. Classification (priority, automated, promotional, vendor) is metadata Daythread computes; it never deletes a message to keep an inbox tidy. The only payment Daythread handles is your own Pro subscription, processed by Stripe; Daythread stores the plan, its status and Stripe&rsquo;s identifiers, never card numbers.
        </Section>

        <Section title="AI features">
          Summaries and reply drafts run on rules by default. When the deployment has an AI model configured and your plan includes AI features, the text of the relevant conversation is sent to that model to produce a summary or draft. It is not used to train models. You can tell which path produced a result: the product labels it.
        </Section>

        <Section title="Analytics">
          Daythread records product events (for example: signed up, connected a channel, upgraded) with your inbox id, to understand which parts of the product are used. Analytics never contain message contents, credentials, or the contents of your customers&rsquo; data.
        </Section>

        <Section title="Retention and deletion">
          Data stays as long as the inbox exists. Deleting the inbox (Settings → Profile → Delete inbox) permanently removes it, its people, conversations, messages, teammates&rsquo; access and every connected-account credential, within minutes. Stripe retains its own records of charges as required by law. Backups roll off within 30 days.
        </Section>

        <Section title="Who can see what">
          Only people you invite to your inbox can see its data; every request is scoped to the inbox on the server. Teammates see the same conversations you do.
        </Section>

        <Section title="Contact">
          Questions or requests about your data: email privacy@daythread.org.
        </Section>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-sm font-bold uppercase tracking-[0.12em] text-ink/50">{title}</h2>
      <div className="mt-2 text-[15px] leading-relaxed text-ink/80">{children}</div>
    </section>
  );
}
