"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 0 → 1 as a section travels through the viewport, rAF-throttled, reversible, and 1 under
 * prefers-reduced-motion so every scroll-linked scene resolves to its final state.
 *
 * `span` picks the travel: "enter" runs from the section's top touching the viewport bottom
 * to its top reaching `settle` × viewport height from the top — the window in which a scene
 * plays as it comes into view; "pinned" runs across a taller-than-viewport section (the
 * story) from pinned start to pinned end.
 */
export function useScrollProgress<T extends HTMLElement>(span: "enter" | "pinned" = "enter", settle = 0.35) {
  const ref = useRef<T>(null);
  const [p, setP] = useState(0);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setReduced(true);
      setP(1);
      return;
    }
    const el = ref.current;
    if (!el) return;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        const vh = window.innerHeight;
        let v: number;
        if (span === "pinned") v = -r.top / Math.max(r.height - vh, 1);
        else v = (vh - r.top) / Math.max(vh * (1 - settle), 1);
        setP(Math.max(0, Math.min(1, v)));
        ticking = false;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [span, settle]);

  return { ref, p, reduced };
}

export const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
export const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
export const seg = (p: number, a: number, b: number) => easeOut(clamp01((p - a) / (b - a)));
