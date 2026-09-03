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
 * The signature entrance. A coral thread draws itself across an empty screen, turns violet
 * then green as it goes, resolves into the mark, and the name snaps in on it — then the
 * whole sheet lifts to reveal the hero that was painted underneath all along.
 *
 * Rules it lives by:
 *  - ~1.25s, all CSS keyframes (no animation library, no JS-driven frames). The sheet is
 *    pointer-events-none, so nothing is ever blocked — a visitor can scroll or click
 *    through it from frame one.
 *  - The hero is server-rendered beneath it. If JS never arrives, the sheet's final
 *    keyframe still lifts it away (fill-mode: forwards), so nothing is ever stuck.
 *  - Once per session: a returning visitor sees a 350ms lift, not the sequence.
 *  - prefers-reduced-motion: the sheet is display:none. The page is simply there.
 */
export function Opening() {
  const [mode, setMode] = useState<"full" | "short" | "done">("full");

  useEffect(() => {
    const seen = decide() === "short";
    if (seen) {
      setMode("short");
      document.documentElement.classList.add("dt-returning");
    }
    const t = setTimeout(() => setMode("done"), seen ? 400 : 1500);
    return () => clearTimeout(t);
  }, []);

  if (mode === "done") return null;

  return (
    <div
      aria-hidden
      className={cn("dt-opening fixed inset-0 z-[60] bg-paper pointer-events-none motion-reduce:hidden", mode === "short" && "dt-opening--short")}
    >
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" fill="none">
        <defs>
          <linearGradient id="dt-open-thread" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#F0524D" />
            <stop offset="0.5" stopColor="#6D5AE6" />
            <stop offset="1" stopColor="#13CC78" />
          </linearGradient>
        </defs>
        <path
          className="dt-opening__thread"
          d="M -40 620 C 220 620, 300 300, 520 300 S 800 620, 1010 620 S 1300 300, 1500 300"
          stroke="url(#dt-open-thread)"
          strokeWidth="3"
          strokeLinecap="round"
          pathLength={1}
        />
      </svg>
      <div className="dt-opening__word absolute inset-0 flex items-center justify-center gap-4 md:gap-5">
        <svg viewBox="0 0 24 24" className="w-10 h-10 md:w-14 md:h-14 text-ink shrink-0" fill="none">
          <path d="M4 18C9 18 9 6 15 6C17 6 18.5 7.5 20 9" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
        </svg>
        <span className="font-sans font-extrabold tracking-[-0.045em] text-ink text-[clamp(2.75rem,9vw,7rem)] leading-none">Daythread</span>
      </div>
    </div>
  );
}
