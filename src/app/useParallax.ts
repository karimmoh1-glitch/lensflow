"use client";

import { useEffect, useRef, useState } from "react";

/** Ties a translateY offset to scroll position — rAF-throttled, transform-only (no layout
 * thrashing), and a no-op under prefers-reduced-motion. `strength` controls how many
 * pixels of offset per 100px scrolled. */
export function useParallax(strength = 8) {
  const [offset, setOffset] = useState(0);
  const ticking = useRef(false);
  const reduced = useRef(false);

  useEffect(() => {
    reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced.current) return;

    function onScroll() {
      if (ticking.current) return;
      ticking.current = true;
      requestAnimationFrame(() => {
        setOffset(window.scrollY * (strength / 100));
        ticking.current = false;
      });
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [strength]);

  return reduced.current ? 0 : offset;
}
