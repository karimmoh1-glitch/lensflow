import Link from "next/link";
import { Lock, Eye, Unplug, CreditCard, Activity, ShieldCheck } from "lucide-react";
import { Reveal } from "./Reveal";

/**
 * What happens to your data, in the product's own words rather than a legal page. Every
 * line here is something the code actually does: credentials encrypted at rest,
 * disconnect revoking at the provider, the assistant proposing rather than sending, a
 * public status page, cancellation that keeps the paid period. Nothing is promised that
 * isn't built.
 */
const ITEMS = [
  { icon: Lock, title: "Your conversations stay yours.", body: "Messages, contacts and bookings are used only to run your inbox. Nothing is sold, shared, or used to train anything." },
  { icon: Eye, title: "AI proposes. You approve.", body: "The assistant writes the reply and waits. Only automations you switched on send by themselves, and every send is written into the thread." },
  { icon: Unplug, title: "Disconnect really disconnects.", body: "Removing a channel revokes Daythread's access at the provider and erases the credentials. What you already had stays in your inbox." },
  { icon: ShieldCheck, title: "Credentials are encrypted.", body: "Channel tokens are stored encrypted at rest. Every provider connection uses the provider's own sign-in — there is never a key to paste." },
  { icon: CreditCard, title: "Billing you can see.", body: "One subscription, monthly or yearly, cancel any time and keep the period you paid for. Daythread never touches payments between you and your customers." },
  { icon: Activity, title: "Status is public.", body: "Whether Daythread is up and which channels are configured is on one page, without pretending a provider is fine when we can't know." },
];

export function Trust() {
  return (
    <div className="max-w-[1200px] mx-auto px-6">
      <Reveal className="max-w-2xl mb-10">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-success-text mb-4">Trust</p>
        <h2 className="font-sans font-extrabold text-[clamp(2.2rem,4.4vw,3.6rem)] leading-[0.94] tracking-[-0.045em] text-ink">Built by people who thought about what happens to your data.</h2>
      </Reveal>
      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {ITEMS.map((it) => (
          <li key={it.title} className="rounded-[20px] border border-border bg-white px-5 py-5">
            <span className="w-9 h-9 rounded-xl bg-paper text-ink flex items-center justify-center"><it.icon className="w-4 h-4" strokeWidth={2} aria-hidden /></span>
            <div className="mt-3 text-base font-extrabold text-ink">{it.title}</div>
            <p className="mt-1.5 text-sm text-ink/70 leading-relaxed">{it.body}</p>
          </li>
        ))}
      </ul>
      <p className="mt-6 text-sm text-ink/70">
        The details are written down: <Link href="/privacy" className="font-semibold text-ink hover:text-accent-text">Privacy</Link>, <Link href="/terms" className="font-semibold text-ink hover:text-accent-text">Terms</Link>, <Link href="/status" className="font-semibold text-ink hover:text-accent-text">Status</Link>, and a person at <a href="mailto:support@daythread.org" className="font-semibold text-ink hover:text-accent-text">support@daythread.org</a>.
      </p>
    </div>
  );
}
