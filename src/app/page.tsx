import { Navbar } from "./Navbar";
import { Opening } from "./landing/Opening";
import { Hero } from "./landing/Hero";
import { ChaosToClarity } from "./landing/ChaosToClarity";
import { Integrations } from "./landing/Integrations";
import { OneThing } from "./landing/OneThing";
import { ProductDemo } from "./landing/ProductDemo";
import { Workflow } from "./landing/Workflow";
import { Outcome } from "./landing/Outcome";
import { WorkspaceAssembly } from "./WorkspaceAssembly";
import { PricingSection } from "./PricingSection";
import { FinalCta } from "./landing/FinalCta";

/**
 * The landing page is a narrative, not a stack of feature sections:
 * open → hero → chaos becomes one thread → every channel flows in → it tells you what
 * matters → click around → it runs itself → before/after → choose your modules → pricing →
 * the end. Each section is one idea, mostly visual, little copy.
 */
export default function LandingPage() {
  // overflow-x-clip, not hidden: hidden would make <main> the scroll container and break the
  // pinned chaos→clarity section's position: sticky.
  return (
    <main className="bg-paper overflow-x-clip">
      <Opening />
      <Navbar />
      <Hero />

      <ChaosToClarity />

      <section id="how" className="py-20 md:py-28 bg-white border-y border-border">
        <Integrations />
      </section>

      <section className="py-20 md:py-28">
        <OneThing />
      </section>

      <section id="demo" className="py-20 md:py-28 bg-white border-y border-border scroll-mt-16">
        <ProductDemo />
      </section>

      <section className="py-20 md:py-28">
        <Workflow />
      </section>

      <section className="py-20 md:py-28 bg-white border-y border-border">
        <Outcome />
      </section>

      <section className="py-20 md:py-28">
        <WorkspaceAssembly />
      </section>

      <div id="pricing" className="bg-white border-t border-border scroll-mt-16">
        <PricingSection />
      </div>

      <FinalCta />
    </main>
  );
}
