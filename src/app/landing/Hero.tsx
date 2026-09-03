import Link from "next/link";
import { HeroThread } from "./HeroThread";

/**
 * The first viewport, painted from the server. Three seconds, no scrolling: who it's for,
 * what it is, the apps flowing into it, one button. Nothing else.
 */
export function Hero() {
  return (
    <section className="relative px-6 pt-10 md:pt-14 pb-14 md:pb-20 lg:min-h-[calc(100vh-72px)] flex items-center">
      <div className="w-full max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-12 lg:gap-8 items-center">
        <div className="dt-hero-copy max-w-lg">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink/45 mb-6">For freelancers &amp; small businesses</p>
          <h1 className="font-sans font-extrabold text-[clamp(2.75rem,6.6vw,5.5rem)] leading-[0.92] tracking-[-0.05em] text-ink text-balance">
            All your clients.<br />One thread.
          </h1>
          <p className="mt-6 text-base md:text-lg text-ink/65 leading-relaxed max-w-sm">
            Instagram, email, texts, bookings and payments — connected, and telling you what&rsquo;s next.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3">
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 h-12 px-6 rounded-full bg-accent text-white text-[15px] font-extrabold shadow-[0_10px_28px_-10px_rgba(240,82,77,0.7)] transition-transform duration-150 hover:scale-[1.04] hover:-translate-y-0.5 active:scale-[0.97] active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2"
            >
              Build your Daythread <span aria-hidden>→</span>
            </Link>
            <span className="text-sm font-semibold text-ink/50">Free to start</span>
          </div>
        </div>

        <div className="dt-hero-visual relative">
          <HeroThread />
        </div>
      </div>
    </section>
  );
}
