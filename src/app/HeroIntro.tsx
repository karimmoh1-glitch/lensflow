"use client";

import { LinkButton } from "@/components/ui";
import { useMounted } from "./useMounted";
import { cn } from "@/lib/utils";

const EASE = "cubic-bezier(0.16,1,0.3,1)"; // snappy deceleration — confident, not mushy
const POP = "cubic-bezier(0.22,1.4,0.36,1)"; // real overshoot — reserved for the headline, the single biggest beat

function Beat({ children, delay, className }: { children: React.ReactNode; delay: number; className?: string }) {
  const mounted = useMounted();
  return (
    <div
      className={cn("transition-all duration-700", mounted ? "opacity-100 translate-y-0 scale-100" : "opacity-0 translate-y-7 scale-[0.96]", className)}
      style={{ transitionTimingFunction: EASE, transitionDelay: mounted ? `${delay}ms` : "0ms" }}
    >
      {children}
    </div>
  );
}

/** The headline gets its own beat with a much larger entrance than the rest of the copy —
 * it's the visual anchor of the opening, landing at the same moment the channel icons in
 * the hero visual are converging, so the whole hero reads as one event instead of text
 * fading in above a separate animation. */
function HeadlineBeat({ children, delay }: { children: React.ReactNode; delay: number }) {
  const mounted = useMounted();
  return (
    <div
      className={cn("transition-all duration-[850ms]", mounted ? "opacity-100 translate-y-0 scale-100" : "opacity-0 translate-y-16 scale-90")}
      style={{ transitionTimingFunction: POP, transitionDelay: mounted ? `${delay}ms` : "0ms" }}
    >
      {children}
    </div>
  );
}

/** The hero's opening choreography — badge, headline, subtext, and CTAs enter in a fast,
 * staggered sequence rather than all at once or as a slow corporate fade. Each button also
 * gets a physical hover/press response (lift + scale) so the page feels responsive to the
 * cursor immediately, not just on first load. */
export function HeroIntro() {
  return (
    <div className="relative text-center max-w-2xl mx-auto shrink-0">
      <Beat delay={0}>
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-white px-3 py-1.5 mb-6 text-xs font-semibold text-ink/70 shadow-xs">
          <span className="w-4 h-4 rounded-full shrink-0" style={{ background: "linear-gradient(135deg, #6D5AE6 0%, #3B82F6 100%)" }} />
          The business OS for people who run their own thing
        </div>
      </Beat>

      <HeadlineBeat delay={140}>
        <h1 className="font-sans font-black text-[clamp(2.75rem,7vw,5rem)] leading-[0.98] tracking-tight text-ink">
          One thread for
          <br />
          your whole business.
        </h1>
      </HeadlineBeat>

      <Beat delay={560}>
        <p className="mt-6 text-base md:text-lg text-ink/55 max-w-md mx-auto leading-relaxed">
          Every message, booking, and payment — organized automatically, the moment it happens.
        </p>
      </Beat>

      <Beat delay={700} className="mt-8 flex items-center justify-center gap-3">
        <LinkButton
          href="/signup"
          size="lg"
          className="rounded-full font-bold transition-transform duration-150 hover:scale-[1.05] hover:-translate-y-0.5 active:scale-[0.96] active:translate-y-0"
        >
          Start Free
        </LinkButton>
        <LinkButton
          href="/demo"
          size="lg"
          variant="outline"
          className="rounded-full font-bold transition-transform duration-150 hover:scale-[1.05] hover:-translate-y-0.5 active:scale-[0.96] active:translate-y-0"
        >
          See live demo
        </LinkButton>
      </Beat>
    </div>
  );
}
