import { LinkButton } from "@/components/ui";
import { LogoMark } from "@/components/Logo";
import { Navbar } from "./Navbar";
import { HeroIntro } from "./HeroIntro";
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

      {/* Hero — bold black sans headline, coral glow, gradient badge, full-pill buttons. */}
      <section className="relative flex flex-col items-center px-6 pt-16 md:pt-24 pb-10 overflow-hidden">
        <div
          className="absolute left-1/2 top-[58%] -translate-x-1/2 -translate-y-1/2 w-[560px] h-[360px] rounded-full opacity-[0.18] blur-3xl pointer-events-none"
          style={{ background: "radial-gradient(ellipse, #F0524D 0%, transparent 72%)" }}
          aria-hidden
        />
        <HeroIntro />
        <div className="relative w-full h-[340px] md:h-[480px] mt-14 md:mt-20">
          <HeroVisual />
        </div>
      </section>

      {/* How it works — the defining visual moment: channels converging into Daythread */}
      <section className="py-16 md:py-24 bg-white border-y border-border overflow-hidden">
        <IntegrationShowcase />
      </section>

      {/* Modularity — a real click-to-toggle module picker, not a passive animation */}
      <section className="py-16 md:py-24 bg-white border-y border-border">
        <WorkspaceAssembly />
      </section>

      {/* Interactive product showcase */}
      <section className="py-16 md:py-24 bg-white border-y border-border">
        <div className="text-center max-w-lg mx-auto mb-8 px-6">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-accent-text mb-3">See it in action</div>
          <h2 className="font-sans font-black text-3xl md:text-[2.75rem] leading-[1.02] tracking-tight text-ink">The product is the pitch.</h2>
        </div>
        <FeatureExplorer />
      </section>

      {/* The connected workflow */}
      <section className="py-16 md:py-24">
        <LandingWorkflowStory />
      </section>

      {/* Mobile story */}
      <section className="py-16 md:py-24 bg-white border-y border-border">
        <LandingMobileStory />
      </section>

      {/* Pricing — PricingSection owns its own section padding, don't double it up */}
      <div id="pricing">
        <PricingSection />
      </div>

      {/* Final CTA — coral + violet-blue + green, the same energy the hero opened with. */}
      <section className="relative bg-midnight text-paper py-28 md:py-36 px-6 overflow-hidden">
        <div
          className="absolute left-[30%] top-1/2 -translate-x-1/2 -translate-y-1/2 w-[480px] h-[480px] rounded-full opacity-[0.22] blur-3xl pointer-events-none"
          style={{ background: "radial-gradient(circle, #6D5AE6 0%, transparent 72%)" }}
          aria-hidden
        />
        <div
          className="absolute left-[70%] top-1/2 -translate-x-1/2 -translate-y-1/2 w-[420px] h-[420px] rounded-full opacity-[0.16] blur-3xl pointer-events-none"
          style={{ background: "radial-gradient(circle, #13CC78 0%, transparent 72%)" }}
          aria-hidden
        />
        <div className="relative max-w-lg mx-auto text-center">
          <LogoMark className="w-8 h-8 mx-auto mb-8 text-paper" />
          <p className="font-sans font-black text-3xl md:text-[2.75rem] leading-[1.02] tracking-tight mb-4">Your business, in one thread.</p>
          <p className="text-paper/50 text-sm md:text-base mb-9">Free to start. No credit card required.</p>
          <LinkButton
            href="/signup"
            size="lg"
            variant="secondary"
            className="rounded-full font-bold transition-transform duration-150 hover:scale-[1.05] hover:-translate-y-0.5 active:scale-[0.96] active:translate-y-0"
          >
            Start Free
          </LinkButton>
        </div>
      </section>
    </main>
  );
}
