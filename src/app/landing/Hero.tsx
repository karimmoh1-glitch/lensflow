import Link from "next/link";
import { HeroThread } from "./HeroThread";
import { PointerField } from "./Pointer";
import { ScrollScene } from "./Scroll";
import { betaOfferOpen } from "@/lib/billing";
import { channelStatuses } from "./channelStatus";

/**
 * The first viewport, painted from the server and visible immediately: what Daythread is
 * (an inbox), what it does for you (books your clients), where it works (the channels
 * people actually write on, each with this deployment's real status), and one way in.
 * The product visual is the larger half. As you begin to scroll, the copy lifts away a
 * little faster than the product does, so the product is what carries into the story.
 */
export function Hero() {
  const beta = betaOfferOpen();
  const status = channelStatuses();
  return (
    <PointerField className="relative px-6 pt-10 md:pt-16 lg:pt-20 pb-16 md:pb-24">
      <ScrollScene span="leave" settle={0.9} rest={0} className="w-full max-w-[1200px] mx-auto grid grid-cols-1 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] gap-12 lg:gap-12 items-center">
        <div className="dt-hero-copy max-w-xl" style={{ transform: "translate3d(0, calc(var(--p, 0) * -48px), 0)", opacity: "calc(1 - var(--p, 0) * 0.75)" }}>
          <p className="text-13 font-medium text-ink/60 mb-5">For photographers, coaches, consultants and studios</p>
          <h1 className="font-sans font-bold text-[clamp(2.6rem,5.4vw,4.6rem)] leading-[0.98] tracking-[-0.045em] text-ink text-balance">The inbox that books your clients.</h1>
          <p className="mt-6 text-[1.0625rem] md:text-lg text-ink/65 leading-relaxed max-w-md">
            Instagram DMs, texts, WhatsApp and email in one place. Daythread shows who&rsquo;s waiting, reads what they want, and helps you book it before they go cold.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/start"
              className="inline-flex items-center h-12 px-6 rounded-xl bg-ink text-white text-[15px] font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_10px_24px_-12px_rgba(16,17,20,0.6)] transition-[background-color,transform] duration-150 hover:bg-black active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/70 focus-visible:ring-offset-2"
            >
              Start free
            </Link>
            <Link href="#flow" className="inline-flex items-center h-12 px-5 rounded-xl text-[15px] font-semibold text-ink/75 hover:text-ink hover:bg-black/[0.04] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/70">
              See how it works
            </Link>
          </div>
          <p className="mt-4 text-13 text-ink/60">{beta ? "Pro free for your first month · No card" : "Free to start · No card"}</p>
        </div>

        {/* Scroll on the outer layer, the entrance animation on the middle one, the pointer
            parallax on the inner one — each owns its own transform, so none overrides another. */}
        <div style={{ transform: "translate3d(0, calc(var(--p, 0) * -24px), 0) scale(calc(1 - var(--p, 0) * 0.03))", transformOrigin: "50% 0%" }}>
          <div className="dt-hero-visual relative">
            <div style={{ transform: "translate(calc(var(--mx) * -5px), calc(var(--my) * -3px))", transition: "transform 600ms cubic-bezier(0.16,1,0.3,1)" }}>
              <HeroThread status={status} />
            </div>
          </div>
        </div>
      </ScrollScene>
    </PointerField>
  );
}
