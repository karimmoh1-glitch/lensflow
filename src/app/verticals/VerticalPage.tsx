import Link from "next/link";
import { Navbar } from "@/app/Navbar";
import { Footer } from "@/app/landing/Footer";
import { Trust } from "@/app/landing/Trust";
import { PricingSection } from "@/app/PricingSection";
import { subscriptionBillingIsLive } from "@/lib/subscriptionBilling";
import { ChannelIcon, type ChannelKey } from "@/app/landing/ChannelIcon";
import { RevealOnScroll } from "@/app/RevealOnScroll";

export type Vertical = {
  slug: string;
  eyebrow: string;
  title: string;
  lede: string;
  channels: ChannelKey[];
  /** The problem, as it actually happens. */
  problems: { title: string; body: string }[];
  /** What Daythread does about it, in the order it happens. */
  steps: { title: string; body: string }[];
  /** Real questions from this kind of business. */
  faq: { q: string; a: string }[];
  /** Honest note on where we are. */
  standing: string;
};

const SITE = process.env.NEXT_PUBLIC_APP_URL ?? "https://daythread.org";

/**
 * One page per kind of business we know well: the same product, described from where
 * they sit. No customer counts, no testimonials, no logos — none exist yet, and the page
 * says so. Everything named here is something the product does today.
 */
export function VerticalPage({ v }: { v: Vertical }) {
  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebPage", "@id": `${SITE}/${v.slug}`, url: `${SITE}/${v.slug}`, name: v.title, description: v.lede, isPartOf: { "@id": `${SITE}/#org` } },
      { "@type": "FAQPage", mainEntity: v.faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) },
    ],
  };
  return (
    <main className="bg-paper overflow-x-clip">
      <Navbar />
      <header className="max-w-[1200px] mx-auto px-6 pt-28 md:pt-36 pb-16 md:pb-20">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink/65">{v.eyebrow}</p>
        <h1 className="mt-4 font-sans font-extrabold text-[clamp(2.4rem,5vw,4.5rem)] leading-[0.95] tracking-[-0.05em] text-ink max-w-4xl text-balance">{v.title}</h1>
        <p className="mt-6 text-base md:text-lg text-ink/70 leading-relaxed max-w-xl">{v.lede}</p>
        <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3">
          <Link href="/start" className="inline-flex items-center gap-2 h-12 px-6 rounded-full bg-accent-strong text-white text-[15px] font-extrabold shadow-[0_10px_28px_-10px_rgba(240,82,77,0.7)] hover:scale-[1.03] active:scale-[0.97] transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2">Start free <span aria-hidden>→</span></Link>
          <span className="text-sm font-semibold text-ink/65">Free to start. No card.</span>
        </div>
        <ul className="mt-10 flex flex-wrap items-center gap-3" aria-label="Channels Daythread brings together">
          {v.channels.map((c) => (
            <li key={c} className="inline-flex items-center gap-2 rounded-full border border-border bg-white pl-1.5 pr-3 py-1 text-xs font-semibold text-ink"><span className="w-6 h-6 rounded-full bg-paper border border-border flex items-center justify-center"><ChannelIcon k={c} size={14} /></span>{c === "gmail" ? "Gmail" : c === "instagram" ? "Instagram" : c === "whatsapp" ? "WhatsApp" : c === "sms" ? "SMS" : "Contact form"}</li>
          ))}
        </ul>
      </header>

      <section className="bg-white border-y border-border py-16 md:py-24" aria-labelledby="problem-title">
        <div className="max-w-[1200px] mx-auto px-6">
          <h2 id="problem-title" className="font-sans font-extrabold text-[1.8rem] md:text-[2.4rem] leading-[1.02] tracking-[-0.04em] text-ink max-w-2xl text-balance">How a lead gets lost.</h2>
          <ol className="mt-8 grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            {v.problems.map((pr, i) => (
              <RevealOnScroll key={pr.title} delay={i * 70}>
                <li className="h-full rounded-2xl border border-border bg-paper px-5 py-5">
                  <span className="text-[11px] font-bold text-accent-text tabular-nums">0{i + 1}</span>
                  <h3 className="mt-2 text-[15px] font-extrabold text-ink">{pr.title}</h3>
                  <p className="mt-1.5 text-sm text-ink/70 leading-relaxed">{pr.body}</p>
                </li>
              </RevealOnScroll>
            ))}
          </ol>
        </div>
      </section>

      <section className="py-16 md:py-24" aria-labelledby="how-title">
        <div className="max-w-[1200px] mx-auto px-6">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-signal-text">What Daythread does about it</p>
          <h2 id="how-title" className="mt-3 font-sans font-extrabold text-[1.8rem] md:text-[2.4rem] leading-[1.02] tracking-[-0.04em] text-ink max-w-2xl text-balance">One thread, from the first message to the booking.</h2>
          <ol className="mt-8 grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {v.steps.map((st, i) => (
              <RevealOnScroll key={st.title} delay={i * 70}>
                <li className="h-full rounded-2xl border border-border bg-white px-5 py-5">
                  <div className="flex items-center gap-2.5">
                    <span className="w-7 h-7 rounded-full bg-ink text-white text-xs font-extrabold flex items-center justify-center tabular-nums">{i + 1}</span>
                    <h3 className="text-[15px] font-extrabold text-ink">{st.title}</h3>
                  </div>
                  <p className="mt-2.5 text-sm text-ink/70 leading-relaxed">{st.body}</p>
                </li>
              </RevealOnScroll>
            ))}
          </ol>
          <p className="mt-8 text-sm text-ink/65 max-w-2xl leading-relaxed">{v.standing}</p>
          <p className="mt-2 text-sm"><Link href="/#demo" className="font-semibold text-ink hover:text-accent-text">See the inbox on the main page →</Link></p>
        </div>
      </section>

      <section className="bg-white border-t border-border py-16 md:py-24"><Trust /></section>

      <div id="pricing" className="bg-white border-t border-border scroll-mt-16"><PricingSection trial={subscriptionBillingIsLive} /></div>

      <section className="bg-paper border-t border-border py-16 md:py-24" aria-labelledby="faq-title">
        <div className="max-w-[840px] mx-auto px-6">
          <h2 id="faq-title" className="font-sans font-extrabold text-[1.8rem] md:text-[2.2rem] leading-[1.02] tracking-[-0.04em] text-ink">Questions we get.</h2>
          <dl className="mt-8 divide-y divide-border">
            {v.faq.map((f) => (
              <div key={f.q} className="py-5">
                <dt className="text-[15px] font-extrabold text-ink">{f.q}</dt>
                <dd className="mt-1.5 text-sm text-ink/70 leading-relaxed">{f.a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="bg-midnight text-paper py-20 md:py-28">
        <div className="max-w-[1200px] mx-auto px-6 text-center">
          <p className="font-sans font-extrabold text-[2rem] md:text-[3rem] leading-[1] tracking-[-0.04em] text-balance">Don&rsquo;t lose the next one.</p>
          <div className="mt-8 flex flex-col items-center gap-3">
            <Link href="/start" className="inline-flex items-center gap-2 h-14 px-8 rounded-full bg-accent-strong text-white text-base font-extrabold shadow-[0_16px_40px_-12px_rgba(240,82,77,0.85)] hover:scale-[1.03] active:scale-[0.97] transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-midnight">Start free <span aria-hidden>→</span></Link>
            <span className="text-sm text-paper/60">Free to start. Pro is $20 a month when you need it.</span>
          </div>
        </div>
      </section>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
      <Footer />
    </main>
  );
}
