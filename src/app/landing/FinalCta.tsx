import Link from "next/link";
import { betaOfferOpen } from "@/lib/billing";

/** The close: one line, one way in. The footer below is the only footer. */
export function FinalCta() {
  const beta = betaOfferOpen();
  return (
    <section id="end" className="relative bg-ink text-paper px-6 py-24 md:py-32 overflow-hidden scroll-mt-16">
      <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-paper/15 to-transparent" />
      <div className="relative max-w-3xl mx-auto text-center">
        <p className="font-sans font-bold text-[clamp(2.4rem,5.6vw,4.4rem)] leading-[0.98] tracking-[-0.045em] text-balance">
          Answer first. Book first.
        </p>
        <p className="mt-5 text-[1.0625rem] text-paper/60">Every inquiry in one place, with the next step ready.</p>
        <div className="mt-9 flex flex-col items-center gap-3">
          <Link
            href="/start"
            className="inline-flex items-center h-12 px-7 rounded-xl bg-paper text-ink text-[15px] font-semibold transition-[background-color,transform] duration-150 hover:bg-white active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-paper/70 focus-visible:ring-offset-2 focus-visible:ring-offset-ink"
          >
            Start free
          </Link>
          <span className="text-13 text-paper/50">{beta ? "Pro free for your first month · No card" : "Free to start · No card"}</span>
        </div>
      </div>
    </section>
  );
}
