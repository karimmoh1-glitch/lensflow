import { LinkButton } from "@/components/ui";
import { LogoMark } from "@/components/Logo";
import { Navbar } from "./Navbar";
import { HeroVisual } from "./HeroVisual";
import { FragmentedChannels } from "./FragmentedChannels";
import { ModulesGrid } from "./ModulesGrid";
import { FeatureExplorer } from "./FeatureExplorer";
import { LandingWorkflowStory } from "./LandingWorkflowStory";
import { LandingMobileStory } from "./LandingMobileStory";
import { PricingSection } from "./PricingSection";

export default function LandingPage() {
  return (
    <main className="bg-paper overflow-x-hidden">
      <Navbar />

      {/* Hero */}
      <section className="relative min-h-[calc(100dvh-72px)] flex flex-col items-center justify-center px-6 py-10 overflow-hidden">
        {/* Soft brand-gradient glow — the page's first color moment, sets the palette before anything else loads */}
        <div
          className="absolute -top-32 left-1/2 -translate-x-1/2 w-[640px] h-[640px] rounded-full opacity-40 blur-3xl pointer-events-none"
          style={{ background: "radial-gradient(circle, #E8A33D 0%, #C75A32 45%, transparent 70%)" }}
          aria-hidden
        />

        <div className="relative text-center max-w-2xl mx-auto shrink-0">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-border bg-white/70 backdrop-blur-sm px-3 py-1 mb-5 text-xs font-medium text-ink/60">
            <LogoMark className="w-3.5 h-3.5" />
            The business OS for people who run their own thing
          </div>
          <h1 className="font-display text-[clamp(2.25rem,5.5vw,4rem)] leading-[1.06] tracking-tight text-ink">
            Turn every message into an <span className="bg-gradient-to-r from-accent to-gold bg-clip-text text-transparent">organized business</span>.
          </h1>
          <p className="mt-5 text-base md:text-lg text-ink/55 max-w-lg mx-auto">
            Clients reach you everywhere. Daythread brings every message into one inbox, sorted by what it actually needs — and turns it
            into work.
          </p>
          <div className="mt-7 flex items-center justify-center gap-3">
            <LinkButton href="/signup" size="lg">
              Start Free
            </LinkButton>
            <LinkButton href="/demo" size="lg" variant="outline">
              See live demo
            </LinkButton>
          </div>
        </div>
        <div className="relative w-full h-[300px] md:h-[340px] mt-10 md:mt-14">
          <HeroVisual />
        </div>
      </section>

      {/* The problem */}
      <section className="px-6 py-16 md:py-24 text-center">
        <FragmentedChannels />
        <p className="mt-8 text-lg md:text-xl text-ink/45 max-w-sm mx-auto">Too many places to keep track of.</p>
      </section>

      {/* Choose your workspace */}
      <section className="py-16 md:py-24 bg-white border-y border-border">
        <ModulesGrid />
      </section>

      {/* Interactive feature showcase */}
      <section className="py-16 md:py-24">
        <div className="text-center max-w-lg mx-auto mb-10 px-6">
          <h2 className="font-display text-2xl md:text-3xl text-ink">See it in action.</h2>
        </div>
        <FeatureExplorer />
      </section>

      {/* The workflow story */}
      <section className="py-16 md:py-24 bg-white border-y border-border">
        <LandingWorkflowStory />
      </section>

      {/* Mobile story */}
      <section className="py-16 md:py-24">
        <LandingMobileStory />
      </section>

      {/* Pricing */}
      <section id="pricing">
        <PricingSection />
      </section>

      {/* Final CTA — dark, so the page ends with real contrast instead of another white section */}
      <section className="relative bg-midnight text-paper py-24 md:py-32 px-6 overflow-hidden">
        <div
          className="absolute -bottom-40 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full opacity-25 blur-3xl pointer-events-none"
          style={{ background: "radial-gradient(circle, #E8A33D 0%, #C75A32 50%, transparent 70%)" }}
          aria-hidden
        />
        <div className="relative max-w-lg mx-auto text-center">
          <LogoMark className="w-10 h-10 mx-auto mb-6" />
          <p className="font-display text-3xl md:text-4xl leading-tight mb-3">Your business, in one thread.</p>
          <p className="text-paper/55 text-sm md:text-base mb-8">Free to start. No credit card required.</p>
          <LinkButton href="/signup" size="lg" variant="secondary">
            Start Free
          </LinkButton>
        </div>
      </section>
    </main>
  );
}
