"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const KEY = "dt-opened";

// Decided once per page load, outside React: in development, strict mode runs the mount
// effect twice, and a second read would see the flag the first run had just written and
// demote every first visit to the short version.
let decision: "full" | "short" | null = null;
function decide(): "full" | "short" {
  if (decision) return decision;
  let seen = false;
  try {
    seen = sessionStorage.getItem(KEY) === "1";
    sessionStorage.setItem(KEY, "1");
  } catch {
    /* private mode etc. — play it once, that's fine */
  }
  decision = seen ? "short" : "full";
  return decision;
}

/**
 * The signature entrance: blank → signal → thread → Daythread → the world opens.
 *
 *   0ms     an empty sheet of paper
 *   80ms    a coral signal appears at the left edge and pulses once — something arrived
 *   200ms   the thread draws out of it across the screen, coral → violet → green
 *   220ms   a message chip travels the thread just behind the pen
 *   960ms   the chip lands at the far end and resolves into a green node — handled
 *   1080ms  the name is revealed left-to-right, a wipe, not a fade — the thread writes it
 *   1620ms  the sheet lifts; the hero beneath rises to meet it
 *   2080ms  done
 *
 * All CSS keyframes, transform/opacity/clip-path only. pointer-events-none: nothing is
 * ever blocked. Once per session; returning visitors get a 350ms lift. Reduced motion:
 * the sheet is display:none and the page is simply there. If JS never arrives, the lift
 * keyframe still runs (fill-mode forwards), so the sheet can't get stuck.
 */
export function Opening() {
  const [mode, setMode] = useState<"full" | "short" | "done">("full");

  useEffect(() => {
    const seen = decide() === "short";
    if (seen) {
      setMode("short");
      document.documentElement.classList.add("dt-returning");
    }
    const t = setTimeout(() => setMode("done"), seen ? 400 : 2100);
    return () => clearTimeout(t);
  }, []);

  if (mode === "done") return null;

  return (
    <div aria-hidden className={cn("dt-opening fixed inset-0 z-[60] bg-paper pointer-events-none motion-reduce:hidden", mode === "short" && "dt-opening--short")}>
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" fill="none">
        <defs>
          <linearGradient id="dt-open-thread" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#F0524D" />
            <stop offset="0.5" stopColor="#6D5AE6" />
            <stop offset="1" stopColor="#13CC78" />
          </linearGradient>
        </defs>
        {/* the signal */}
        <circle className="dt-opening__signal" cx="40" cy="620" r="6" fill="#F0524D" />
        <circle className="dt-opening__ring" cx="40" cy="620" r="6" stroke="#F0524D" strokeWidth="2" />
        {/* the thread */}
        <path
          className="dt-opening__thread"
          d="M 40 620 C 260 620, 320 300, 540 300 S 800 620, 1010 620 S 1300 300, 1500 300"
          stroke="url(#dt-open-thread)"
          strokeWidth="3"
          strokeLinecap="round"
          pathLength={1}
        />
        {/* the message, travelling the thread */}
        <g className="dt-opening__chip">
          <rect x="-22" y="-9" width="44" height="18" rx="9" fill="#101114" />
          <circle cx="-11" cy="0" r="2.5" fill="#F0524D" />
          <rect x="-4" y="-1.5" width="18" height="3" rx="1.5" fill="white" opacity="0.85" />
        </g>
        {/* where it lands: resolved */}
        <circle className="dt-opening__node" cx="1400" cy="366" r="7" fill="#13CC78" />
        <circle className="dt-opening__node-ring" cx="1400" cy="366" r="7" stroke="#13CC78" strokeWidth="2" />
      </svg>
      <div className="dt-opening__word absolute inset-0 flex items-center justify-center gap-4 md:gap-6">
        <svg viewBox="0 0 24 24" className="w-10 h-10 md:w-16 md:h-16 text-ink shrink-0" fill="none">
          <path d="M4 18C9 18 9 6 15 6C17 6 18.5 7.5 20 9" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
        </svg>
        <span className="font-sans font-extrabold tracking-[-0.05em] text-ink text-[clamp(2.75rem,10vw,8rem)] leading-none">Daythread</span>
      </div>
    </div>
  );
}
