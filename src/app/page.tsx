import Link from "next/link";
import { LinkButton } from "@/components/ui";
import { OmnichannelHero } from "./OmnichannelHero";
import { FragmentedChannels } from "./FragmentedChannels";
import { LandingWorkflowStory } from "./LandingWorkflowStory";
import { LandingMobileStory } from "./LandingMobileStory";

export default function LandingPage() {
  return (
    <main className="bg-paper">
      <nav className="sticky top-0 z-30 bg-paper/90 backdrop-blur-sm w-full flex items-center justify-between px-6 py-5">
        <span className="font-display text-xl">LensFlow</span>
        <div className="flex items-center gap-5">
          <Link href="/login" className="text-sm font-medium text-ink/70 hover:text-ink">
            Log in
          </Link>
          <Link href="/signup" className="text-sm font-medium text-ink/70 hover:text-ink">
            Start Free
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="min-h-[calc(100dvh-76px)] flex flex-col items-center justify-center px-6 py-10">
        <div className="text-center max-w-2xl mx-auto shrink-0">
          <h1 className="font-display text-[clamp(1.75rem,4vw,3rem)] leading-[1.12] text-ink">Turn every message into an organized business.</h1>
          <p className="mt-3 text-sm md:text-base text-ink/55 max-w-lg mx-auto">
            Clients reach you everywhere. LensFlow brings every message into one inbox, sorted by what it actually needs — and turns it
            into work.
          </p>
          <div className="mt-5">
            <LinkButton href="/signup" size="lg">
              Start Free
            </LinkButton>
          </div>
        </div>
        <div className="w-full h-[300px] md:h-[340px] mt-10 md:mt-14">
          <OmnichannelHero />
        </div>
      </section>

      {/* The problem */}
      <section className="px-6 py-16 text-center">
        <FragmentedChannels />
        <p className="mt-8 text-lg md:text-xl text-ink/45 max-w-sm mx-auto">Too many places to keep track of.</p>
      </section>

      {/* The workflow story */}
      <section className="py-12 md:py-16">
        <LandingWorkflowStory />
      </section>

      {/* Mobile story */}
      <section className="py-12 md:py-16 bg-white border-y border-border">
        <LandingMobileStory />
      </section>

      {/* Final CTA */}
      <section className="max-w-lg mx-auto px-6 py-20 text-center">
        <p className="font-display text-2xl md:text-3xl text-ink mb-6">Nothing falls through the cracks.</p>
        <LinkButton href="/signup" size="lg">
          Create your workspace
        </LinkButton>
      </section>
    </main>
  );
}
