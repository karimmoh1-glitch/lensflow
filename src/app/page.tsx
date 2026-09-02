import { LinkButton } from "@/components/ui";
import { LogoMark } from "@/components/Logo";
import { Navbar } from "./Navbar";
import { HeroVisual } from "./HeroVisual";
import { IntegrationShowcase } from "./IntegrationShowcase";
import { WorkspaceAssembly } from "./WorkspaceAssembly";
import { FeatureExplorer } from "./FeatureExplorer";
import { LandingWorkflowStory } from "./LandingWorkflowStory";
import { LandingMobileStory } from "./LandingMobileStory";
import { PricingSection } from "./PricingSection";

export default function LandingPage() {
  return (
    <main className="bg-paper overflow-x-hidden">
      <Navbar />

      {/* Hero — confidence from scale and restraint, with one precise touch of atmosphere
          anchored behind the product visual, not smeared across the whole section. */}
      <section className="relative flex flex-col items-center px-6 pt-16 md:pt-24 pb-10 overflow-hidden">
        <div
          className="absolute left-1/2 top-[62%] -translate-x-1/2 -translate-y-1/2 w-[520px] h-[320px] rounded-full opacity-[0.14] blur-3xl pointer-events-none"
          style={{ background: "radial-gradient(ellipse, #C75A32 0%, transparent 72%)" }}
          aria-hidden
        />
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

      {/* How it works — the defining visual moment: channels converging into Daythread */}
      <section className="py-24 md:py-32 bg-white border-y border-border overflow-hidden">
        <IntegrationShowcase />
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

      {/* Final CTA — bookends the hero's warm glow with the signal color that ran through
          the integrations story, closing the "chaos → organized" arc. */}
      <section className="relative bg-midnight text-paper py-28 md:py-36 px-6 overflow-hidden">
        <div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[480px] h-[480px] rounded-full opacity-[0.18] blur-3xl pointer-events-none"
          style={{ background: "radial-gradient(circle, #6D5AE6 0%, transparent 72%)" }}
          aria-hidden
        />
        <div className="relative max-w-lg mx-auto text-center">
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
