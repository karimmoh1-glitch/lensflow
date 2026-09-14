"use client";

import { useEffect } from "react";

/**
 * Motion is an enhancement, never a gate. The page renders fully without this component; once
 * it runs (and only if the visitor has not asked for reduced motion) it marks the page as
 * animated and reveals each [data-reveal] block the first time it scrolls into view. Lines
 * marked .fp-draw draw themselves at the same moment.
 */
export function FounderMotion() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".fp");
    if (!root) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduce.matches || !("IntersectionObserver" in window)) return;

    const blocks = [...root.querySelectorAll<HTMLElement>("[data-reveal]")];
    // Anything already on screen stays put: no flash of hidden content above the fold.
    const vh = window.innerHeight;
    blocks.forEach((b) => {
      if (b.getBoundingClientRect().top < vh * 0.92) b.classList.add("is-in");
    });
    root.classList.add("fp-motion");

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("is-in");
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.08 }
    );
    blocks.filter((b) => !b.classList.contains("is-in")).forEach((b) => io.observe(b));
    const onChange = () => {
      if (reduce.matches) {
        root.classList.remove("fp-motion");
        io.disconnect();
      }
    };
    reduce.addEventListener("change", onChange);
    return () => {
      io.disconnect();
      reduce.removeEventListener("change", onChange);
    };
  }, []);
  return null;
}
