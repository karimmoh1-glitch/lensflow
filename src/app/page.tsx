import { Navbar } from "./Navbar";
import { Opening } from "./landing/Opening";
import { Hero } from "./landing/Hero";
import { ChaosToClarity } from "./landing/ChaosToClarity";
import { Integrations } from "./landing/Integrations";
import { OneThing } from "./landing/OneThing";
import { ProductDemo } from "./landing/ProductDemo";
import { Workflow } from "./landing/Workflow";
import { Outcome } from "./landing/Outcome";
import { ThreadJoint } from "./landing/ThreadJoint";
import { WorkspaceAssembly } from "./WorkspaceAssembly";
import { PricingSection } from "./PricingSection";
import { FinalCta } from "./landing/FinalCta";

/**
 * One continuous experience, not a stack of sections. The rhythm is deliberate:
 *
 *   open → hero (paper, product moving)
 *   chaos → one thread (paper → a dark sheet, pinned)
 *   every channel in (white, atmosphere in the channel's color)
 *   ONE THING (midnight — the emotional payoff gets the darkest stage)
 *   click around (white, atmosphere in the surface's color)
 *   runs itself (violet-tinted paper)
 *   before / after (white, type only)
 *   modules (paper) → pricing (white) → the end (midnight, the thread returns)
 *
 * The thread reappears between sections as a short joint — the page's backbone, seen
 * only occasionally.
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

      <ThreadJoint tone="signal" />

      <section id="how" className="relative py-20 md:py-28 bg-white border-y border-border overflow-hidden scroll-mt-16">
        <Integrations />
      </section>

      <section className="relative py-24 md:py-32 bg-midnight overflow-hidden">
        <OneThing />
      </section>

      <section id="demo" className="relative py-20 md:py-28 bg-white border-b border-border overflow-hidden scroll-mt-16">
        <ProductDemo />
      </section>

      <section className="relative py-20 md:py-28 bg-[linear-gradient(180deg,#FAFAF9_0%,#EEEBFC_55%,#FAFAF9_100%)]">
        <Workflow />
      </section>

      <section className="py-20 md:py-28 bg-white border-y border-border">
        <Outcome />
      </section>

      <ThreadJoint tone="accent" />

      <section className="pb-20 md:pb-28">
        <WorkspaceAssembly />
      </section>

      <div id="pricing" className="bg-white border-t border-border scroll-mt-16">
        <PricingSection />
      </div>

      <FinalCta />
    </main>
  );
}
