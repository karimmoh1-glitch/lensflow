import { Navbar } from "./Navbar";
import { Opening } from "./landing/Opening";
import { Hero } from "./landing/Hero";
import { Story } from "./landing/Story";
import { OneThing } from "./landing/OneThing";
import { ProductDemo } from "./landing/ProductDemo";
import { Workflow } from "./landing/Workflow";
import { CalendarBeat } from "./landing/CalendarBeat";
import { AssistantBeat } from "./landing/AssistantBeat";
import { Spine } from "./landing/Spine";
import { Proof } from "./landing/Proof";
import { Faq, FAQ } from "./landing/Faq";
import { PLANS } from "@/lib/billing";
import { PricingSection } from "./PricingSection";
import { FinalCta } from "./landing/FinalCta";
import { Footer } from "./landing/Footer";

/**
 * One film, in this order:
 *
 *   open → hero (the channels flowing into the product, alive)
 *   the story — one pinned, scroll-driven stage: chaos → one thread → context → action →
 *     outcome → the thread widens into the product itself
 *   the business gets quiet — one thing to do (midnight)
 *   click around — the product, interactive
 *   the calendar — a message moves a booking, the confirmation goes back out
 *   it runs itself — an automation firing
 *   the assistant — it proposes, you approve, it lands in done
 *   pricing — the natural conclusion
 *   the end — the thread returns, organized, and one line
 *
 * Every transformation is tied to scroll position; nothing waits on a timer except the
 * opening (~1.4s) and the ambient loops that don't block anything.
 */
const SITE = process.env.NEXT_PUBLIC_APP_URL ?? "https://daythread.org";

/** Only facts: who makes it, what it is, what it costs, and the FAQ as written on the page. */
function structuredData() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Organization", "@id": `${SITE}/#org`, name: "Daythread", url: SITE, logo: `${SITE}/icon`, email: "support@daythread.org" },
      {
        "@type": "SoftwareApplication",
        name: "Daythread",
        url: SITE,
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        description: "One inbox for every customer conversation — Instagram, Gmail, WhatsApp, SMS and your contact form — with the calendar, bookings, automations and an assistant built around it.",
        publisher: { "@id": `${SITE}/#org` },
        offers: (["FREE", "PRO", "BUSINESS"] as const).map((k) => ({ "@type": "Offer", name: `Daythread ${PLANS[k].name}`, price: (PLANS[k].priceCents / 100).toFixed(0), priceCurrency: "USD", url: `${SITE}/#pricing` })),
      },
      { "@type": "FAQPage", mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) },
    ],
  };
}

export default function LandingPage() {
  // overflow-x-clip, not hidden: hidden would make <main> the scroll container and break the
  // pinned story's position: sticky.
  return (
    <main className="bg-paper overflow-x-clip">
      <Opening />
      <Navbar />
      <Spine />
      <div id="top" className="scroll-mt-16">
        <Hero />
      </div>
      <Story />

      <section className="relative py-24 md:py-32 bg-midnight overflow-hidden">
        <OneThing />
      </section>

      <section id="demo" className="relative py-20 md:py-28 bg-white border-b border-border overflow-hidden scroll-mt-16">
        <ProductDemo />
      </section>

      <section id="calendar" className="relative py-20 md:py-28 bg-paper border-b border-border overflow-hidden scroll-mt-16">
        <CalendarBeat />
      </section>

      <section id="how" className="relative py-20 md:py-28 bg-[linear-gradient(180deg,#FAFAF9_0%,#EEEBFC_55%,#FAFAF9_100%)] scroll-mt-16">
        <Workflow />
      </section>

      <section id="assistant" className="relative py-20 md:py-28 bg-white border-t border-border overflow-hidden scroll-mt-16">
        <AssistantBeat />
      </section>

      <section id="proof" className="relative py-20 md:py-24 bg-paper border-t border-border scroll-mt-16">
        <Proof />
      </section>

      <div id="pricing" className="bg-white border-t border-border scroll-mt-16">
        <PricingSection />
      </div>

      <section id="faq" className="relative py-20 md:py-24 bg-paper border-t border-border scroll-mt-16">
        <Faq />
      </section>

      <FinalCta />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData()) }} />
      <Footer />
    </main>
  );
}
