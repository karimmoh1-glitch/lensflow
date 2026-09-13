import Link from "next/link";
import { Lock, Eye, Unplug, Activity } from "lucide-react";
import { Reveal } from "./Reveal";

/**
 * What happens to your data and your customers, in precise language. Every line is
 * something the code does today; nothing is rounded up into a promise.
 */
const ITEMS = [
  { icon: Eye, title: "Nothing sends without you", body: "Drafts and assistant proposals wait for your approval. Only automations you switch on send by themselves, and every send is written into the thread." },
  { icon: Lock, title: "Credentials encrypted at rest", body: "Connections use each provider's own sign-in wherever it offers one, and every stored token or app password is encrypted." },
  { icon: Unplug, title: "Disconnect means disconnect", body: "Removing a channel revokes Daythread's access at the provider and erases the stored credentials." },
  { icon: Activity, title: "Status in the open", body: "A public page shows whether Daythread is up and which channels this deployment has configured." },
];

export function Trust() {
  return (
    <div className="max-w-[1200px] mx-auto px-6">
      <Reveal className="max-w-2xl mb-10">
        <h2 className="font-sans font-bold text-[clamp(2.1rem,4.2vw,3.4rem)] leading-[1] tracking-[-0.04em] text-ink text-balance">Your clients trust you. Daythread is built to keep it.</h2>
      </Reveal>
      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px rounded-2xl overflow-hidden border border-border bg-border">
        {ITEMS.map((it) => (
          <li key={it.title} className="bg-white px-5 py-6">
            <it.icon className="w-4 h-4 text-ink/60" strokeWidth={2} aria-hidden />
            <p className="mt-4 text-[15px] font-semibold text-ink tracking-[-0.01em]">{it.title}</p>
            <p className="mt-1.5 text-13 text-ink/60 leading-relaxed">{it.body}</p>
          </li>
        ))}
      </ul>
      <p className="mt-5 text-13 text-ink/55">
        Daythread doesn&rsquo;t collect payments from your clients. Read the <Link href="/privacy" className="font-medium text-ink underline decoration-ink/20 underline-offset-2">privacy policy</Link>, the <Link href="/terms" className="font-medium text-ink underline decoration-ink/20 underline-offset-2">terms</Link> and the <Link href="/status" className="font-medium text-ink underline decoration-ink/20 underline-offset-2">status page</Link>, or write to <a href="mailto:support@daythread.org" className="font-medium text-ink underline decoration-ink/20 underline-offset-2">support@daythread.org</a>.
      </p>
    </div>
  );
}
