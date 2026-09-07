import { Navbar } from "./Navbar";
import { Opening } from "./landing/Opening";
import { Hero } from "./landing/Hero";
import { HowItWorks } from "./landing/HowItWorks";
import { PricingSection } from "./PricingSection";
import { FinalCta } from "./landing/FinalCta";
import { Footer } from "./landing/Footer";

/**
 * The site, in the order the product is understood: the channels flowing into one inbox
 * (alive), how it works in three beats, the two plans, and the line it was building to.
 */
export default function LandingPage() {
  return (
    <main className="bg-paper overflow-x-clip">
      <Opening />
      <Navbar />
      <Hero />
      <section id="how" className="relative py-20 md:py-28 bg-[linear-gradient(180deg,#FAFAF9_0%,#EEEBFC_55%,#FAFAF9_100%)] scroll-mt-16">
        <HowItWorks />
      </section>
      <div id="pricing" className="bg-white border-t border-border scroll-mt-16">
        <PricingSection />
      </div>
      <FinalCta />
      <Footer />
    </main>
  );
}
