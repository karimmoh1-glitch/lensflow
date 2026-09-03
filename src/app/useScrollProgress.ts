"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Scroll progress (0–1) through a tall wrapper element — the standard primitive for a
 * pinned/sticky scroll-scrubbed section: the wrapper is N×100vh tall, an inner child is
 * `sticky top-0`, and this hook reports how far the user has scrolled through that track
 * so the pinned content can be driven by it. rAF-throttled, transform/opacity-friendly
 * (no layout reads in the hot path beyond the one getBoundingClientRect per frame).
 *
 * Reduced-motion users get a static `progress` of 1 (the finished/settled state) and
 * `active: false` — callers should render the end state directly with no motion rather
 * than trying to animate at all.
 */
export function useScrollProgress<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [progress, setProgress] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const ticking = useRef(false);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setReducedMotion(reduced);
    if (reduced) {
      setProgress(1);
      return;
    }

    function onScroll() {
      if (ticking.current) return;
      ticking.current = true;
      requestAnimationFrame(() => {
        const el = ref.current;
        if (el) {
          const rect = el.getBoundingClientRect();
          const trackHeight = rect.height - window.innerHeight;
          const p = trackHeight > 0 ? (0 - rect.top) / trackHeight : 0;
          setProgress(Math.min(1, Math.max(0, p)));
        }
        ticking.current = false;
      });
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return { ref, progress, reducedMotion };
}
