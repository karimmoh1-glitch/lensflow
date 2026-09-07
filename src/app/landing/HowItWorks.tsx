import { RevealOnScroll } from "../RevealOnScroll";
import { ChannelIcon, type ChannelKey } from "./ChannelIcon";

/** Three beats, no more: connect, read, reply. Each is something the product actually does. */
const STEPS: Array<{ n: string; title: string; body: string; channels?: ChannelKey[] }> = [
  { n: "01", title: "Connect a channel", body: "Gmail, Instagram, WhatsApp, a text number, or a contact form for your site. Each uses the provider's own sign-in — there is never a key to paste.", channels: ["gmail", "instagram", "whatsapp", "sms", "website"] },
  { n: "02", title: "Read one inbox", body: "Every message, newest first, with the people waiting on you at the top. Automated mail, newsletters and platform notices are kept out of the way — not deleted, just not in your face." },
  { n: "03", title: "Reply from where it came", body: "Answer an Instagram DM as a DM and an email as an email, from the same thread. Every message shows whether it was actually delivered. On Pro, teammates share the inbox and AI drafts the first reply." },
];

export function HowItWorks() {
  return (
    <div className="px-6 max-w-[1200px] mx-auto">
      <div className="max-w-2xl mb-12">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink/45 mb-4">How it works</p>
        <h2 className="font-sans font-extrabold text-[clamp(2.2rem,5vw,4rem)] leading-[0.94] tracking-[-0.045em] text-ink text-balance">Connect. Read. Reply.</h2>
      </div>
      <ol className="grid md:grid-cols-3 gap-4 md:gap-5">
        {STEPS.map((s, i) => (
          <RevealOnScroll key={s.n} delay={i * 90} className="h-full">
            <li className="h-full rounded-[22px] border border-border bg-white p-6 md:p-7 flex flex-col">
              <span className="text-[11px] font-bold tracking-[0.16em] text-accent-text">{s.n}</span>
              <h3 className="mt-3 font-sans font-extrabold text-xl tracking-[-0.02em] text-ink">{s.title}</h3>
              <p className="mt-2 text-sm text-ink/65 leading-relaxed flex-1">{s.body}</p>
              {s.channels && (
                <ul className="mt-5 flex items-center gap-2" aria-label="Channels">
                  {s.channels.map((k) => (
                    <li key={k}><ChannelIcon k={k} size={36} /></li>
                  ))}
                </ul>
              )}
            </li>
          </RevealOnScroll>
        ))}
      </ol>
    </div>
  );
}
