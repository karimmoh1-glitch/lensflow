import { Navbar } from "./Navbar";
import { Hero } from "./landing/Hero";
import { Flow } from "./landing/Flow";
import { ProductDemo } from "./landing/ProductDemo";
import { Channels } from "./landing/Channels";
import { Faq, FAQ } from "./landing/Faq";
import { Trust } from "./landing/Trust";
import { LandingBeacon } from "./landing/LandingBeacon";
import { PLANS, betaOfferOpen, planPurchasable } from "@/lib/billing";
import { subscriptionBillingIsLive } from "@/lib/subscriptionBilling";
import { PricingSection } from "./PricingSection";
import { FinalCta } from "./landing/FinalCta";
import { Footer } from "./landing/Footer";

/**
 * The page in order: what it is (hero), how one conversation becomes a booking (flow), try
 * the inbox (demo), where it works (channels, with this deployment's real status), trust,
 * pricing, questions, and one closing line. Visible on the first paint; motion is a settle,
 * never a wait.
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
        description: "The inbox that books your clients: Instagram DMs, texts, WhatsApp, Gmail, Outlook and Zoom chat in one place, with booking in the conversation.",
        publisher: { "@id": `${SITE}/#org` },
        offers: (["FREE", "PRO", "BUSINESS"] as const).map((k) => ({ "@type": "Offer", name: `Daythread ${PLANS[k].name}`, price: (PLANS[k].priceCents / 100).toFixed(0), priceCurrency: "USD", url: `${SITE}/#pricing`, availability: k === "FREE" || planPurchasable(k) ? "https://schema.org/InStock" : "https://schema.org/OutOfStock" })),
      },
      { "@type": "FAQPage", mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) },
    ],
  };
}

export default function LandingPage() {
  // overflow-x-clip, not hidden: hidden would make <main> the scroll container and break sticky children.
  return (
    <main className="bg-paper overflow-x-clip">
      <LandingBeacon />
      <Navbar />
      <div id="top" className="scroll-mt-16">
        <Hero />
      </div>

      <section id="flow" aria-label="From message to booked" className="relative py-20 md:py-28 bg-white border-y border-border scroll-mt-16">
        <Flow />
      </section>

      <section id="demo" aria-label="Try the inbox" className="relative py-20 md:py-28 bg-paper overflow-hidden scroll-mt-16">
        <ProductDemo />
      </section>

      <section id="channels" aria-label="Channels" className="relative py-20 md:py-28 bg-white border-y border-border scroll-mt-16">
        <Channels />
      </section>

      <section id="trust" aria-label="Trust" className="relative py-20 md:py-24 bg-paper scroll-mt-16">
        <Trust />
      </section>

      <div id="pricing" className="bg-white border-y border-border scroll-mt-16">
        <PricingSection trial={subscriptionBillingIsLive} beta={betaOfferOpen()} />
      </div>

      <section id="faq" aria-label="Questions" className="relative py-20 md:py-24 bg-paper scroll-mt-16">
        <Faq />
      </section>

      <FinalCta />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData()) }} />
      <Footer />
    </main>
  );
}
