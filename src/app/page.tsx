import { Navbar } from "./Navbar";
import { Opening } from "./landing/Opening";
import { Hero } from "./landing/Hero";
import { Story } from "./landing/Story";
import { OneThing } from "./landing/OneThing";
import { ProductDemo } from "./landing/ProductDemo";
import { Workflow } from "./landing/Workflow";
import { PricingSection } from "./PricingSection";
import { FinalCta } from "./landing/FinalCta";

/**
 * One film, in this order:
 *
 *   open → hero (the channels flowing into the product, alive)
 *   the story — one pinned, scroll-driven stage: chaos → one thread → context → action →
 *     outcome → the thread widens into the product itself
 *   the business gets quiet — one thing to do (midnight)
 *   click around — the product, interactive
 *   it runs itself — an automation firing
 *   pricing — the natural conclusion
 *   the end — the thread returns, organized, and one line
 *
 * Every transformation is tied to scroll position; nothing waits on a timer except the
 * opening (~1.4s) and the ambient loops that don't block anything.
 */
export default function LandingPage() {
  // overflow-x-clip, not hidden: hidden would make <main> the scroll container and break the
  // pinned story's position: sticky.
  return (
    <main className="bg-paper overflow-x-clip">
      <Opening />
      <Navbar />
      <Hero />
      <Story />

      <section className="relative py-24 md:py-32 bg-midnight overflow-hidden">
        <OneThing />
      </section>

      <section id="demo" className="relative py-20 md:py-28 bg-white border-b border-border overflow-hidden scroll-mt-16">
        <ProductDemo />
      </section>

      <section id="how" className="relative py-20 md:py-28 bg-[linear-gradient(180deg,#FAFAF9_0%,#EEEBFC_55%,#FAFAF9_100%)] scroll-mt-16">
        <Workflow />
      </section>

      <div id="pricing" className="bg-white border-t border-border scroll-mt-16">
        <PricingSection />
      </div>

      <FinalCta />
    </main>
  );
}
