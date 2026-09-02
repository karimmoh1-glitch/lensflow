import { LinkButton } from "@/components/ui";
import { LogoMark } from "@/components/Logo";
import { Navbar } from "./Navbar";
import { HeroVisual } from "./HeroVisual";
import { IntegrationFlows } from "./IntegrationFlows";
import { WorkspaceAssembly } from "./WorkspaceAssembly";
import { FeatureExplorer } from "./FeatureExplorer";
import { LandingWorkflowStory } from "./LandingWorkflowStory";
import { LandingMobileStory } from "./LandingMobileStory";
import { PricingSection } from "./PricingSection";

export default function LandingPage() {
  return (
    <main className="bg-paper overflow-x-hidden">
      <Navbar />

      {/* Hero — no gradient text, no glow blob. Confidence comes from scale and restraint. */}
      <section className="relative flex flex-col items-center px-6 pt-16 md:pt-24 pb-10">
        <div className="relative text-center max-w-2xl mx-auto shrink-0">
          <h1 className="font-display text-[clamp(2.5rem,6vw,4.5rem)] leading-[1.03] tracking-tight text-ink">
            One thread for
            <br />
            your whole business.
          </h1>
          <p className="mt-6 text-base md:text-lg text-ink/55 max-w-md mx-auto leading-relaxed">
            Every message, booking, and payment — organized automatically, the moment it happens.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <LinkButton href="/signup" size="lg">
              Start Free
            </LinkButton>
            <LinkButton href="/demo" size="lg" variant="outline">
              See live demo
            </LinkButton>
          </div>
        </div>
        <div className="relative w-full h-[300px] md:h-[340px] mt-14 md:mt-20">
          <HeroVisual />
        </div>
      </section>

      {/* How it works — channels flowing into Daythread, not a logo row */}
      <section className="py-20 md:py-28 bg-white border-y border-border">
        <IntegrationFlows />
      </section>

      {/* Modularity — the workspace assembles itself as you scroll */}
      <section className="py-20 md:py-28">
        <WorkspaceAssembly />
      </section>

      {/* Interactive product showcase */}
      <section className="py-20 md:py-28 bg-white border-y border-border">
        <div className="text-center max-w-lg mx-auto mb-10 px-6">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-ink/40 mb-3">See it in action</div>
          <h2 className="font-display text-3xl md:text-[2.5rem] leading-[1.1] text-ink">The product is the pitch.</h2>
        </div>
        <FeatureExplorer />
      </section>

      {/* The connected workflow */}
      <section className="py-20 md:py-28">
        <LandingWorkflowStory />
      </section>

      {/* Mobile story */}
      <section className="py-20 md:py-28 bg-white border-y border-border">
        <LandingMobileStory />
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-20 md:py-28">
        <PricingSection />
      </section>

      {/* Final CTA — dark, precise, no glow. The mark alone carries the ending. */}
      <section className="bg-midnight text-paper py-28 md:py-36 px-6">
        <div className="max-w-lg mx-auto text-center">
          <LogoMark className="w-8 h-8 mx-auto mb-8 text-paper" />
          <p className="font-display text-3xl md:text-[2.75rem] leading-[1.1] mb-4">Your business, in one thread.</p>
          <p className="text-paper/50 text-sm md:text-base mb-9">Free to start. No credit card required.</p>
          <LinkButton href="/signup" size="lg" variant="secondary">
            Start Free
          </LinkButton>
        </div>
      </section>
    </main>
  );
}
