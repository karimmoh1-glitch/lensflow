import type { CSSProperties } from "react";
import Link from "next/link";
import { betaOfferOpen } from "@/lib/billing";
import { ScrollScene } from "./Scroll";

/**
 * The close: the whole story in one line, then one way in. The five stages settle into
 * place as the section arrives; the headline and the button never wait for them.
 */
const STAGES = ["Inquiry", "Conversation", "Booking", "Confirmed", "Client"];

export function FinalCta() {
  const beta = betaOfferOpen();
  return (
    <ScrollScene as="section" span="enter" settle={0.45} id="end" className="relative bg-ink text-paper px-6 py-24 md:py-32 overflow-hidden scroll-mt-16">
      <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-paper/15 to-transparent" />
      <div className="relative max-w-3xl mx-auto text-center">
        <ol className="flex flex-wrap items-center justify-center gap-x-2 gap-y-2 mb-9 text-13 font-medium text-paper/60" aria-label="The five stages">
          {STAGES.map((s, i) => (
            <li key={s} className="dt-step flex items-center gap-2" style={{ "--a": 0.05 + i * 0.15, "--b": 0.2 + i * 0.15, "--dy": "8px" } as CSSProperties}>
              {i > 0 && <span aria-hidden className="w-4 h-px bg-paper/25" />}
              <span className={i === STAGES.length - 1 ? "text-paper" : undefined}>{s}</span>
            </li>
          ))}
        </ol>
        <p className="font-serif font-normal text-[clamp(2.8rem,6.2vw,5rem)] leading-[1] tracking-[-0.012em] text-balance">Answer first. Book first.</p>
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
    </ScrollScene>
  );
}
