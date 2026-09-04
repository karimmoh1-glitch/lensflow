import Link from "next/link";
import { HeroThread } from "./HeroThread";

/**
 * The first viewport, painted from the server. Three seconds, no scrolling: who it's for,
 * what it is, the channels flowing into the product, one button. The product is the
 * larger half on purpose — it's the thing being sold.
 */
export function Hero() {
  return (
    <section className="relative px-6 pt-8 md:pt-12 lg:pt-16 pb-16 md:pb-24 lg:min-h-[calc(84vh-72px)] flex items-start">
      <div className="w-full max-w-[1200px] mx-auto grid grid-cols-1 lg:grid-cols-[minmax(0,0.78fr)_minmax(0,1.22fr)] gap-12 lg:gap-12 items-center">
        <div className="dt-hero-copy max-w-md">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink/45 mb-6">For freelancers &amp; small businesses</p>
          <h1 className="font-sans font-extrabold text-[clamp(2.75rem,6vw,5.4rem)] leading-[0.92] tracking-[-0.05em] text-ink text-balance">
            All your clients.<br /><span className="whitespace-nowrap">One thread.</span>
          </h1>
          <p className="mt-6 text-base md:text-lg text-ink/65 leading-relaxed max-w-sm">
            Instagram, email, texts, bookings and payments — connected, and telling you what&rsquo;s next.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3">
            <Link
              href="/signup"
              className="group inline-flex items-center gap-2 h-12 px-6 rounded-full bg-accent text-white text-[15px] font-extrabold shadow-[0_10px_28px_-10px_rgba(240,82,77,0.7)] transition-all duration-200 ease-[cubic-bezier(0.22,1.2,0.36,1)] hover:scale-[1.04] hover:-translate-y-0.5 hover:shadow-[0_16px_36px_-10px_rgba(240,82,77,0.8)] active:scale-[0.97] active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2"
            >
              Build your Daythread <span aria-hidden className="transition-transform duration-200 group-hover:translate-x-0.5">→</span>
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
