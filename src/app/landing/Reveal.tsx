"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * Staggered entrance for a scene's copy: each child rises into place as the block comes
 * into view, once, in reading order. CSS does the motion (opacity + transform); this only
 * flips a class. Reduced motion renders the final state immediately (see globals.css).
 */
export function Reveal({ as: Tag = "div", className, children }: { as?: "div" | "header"; className?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.classList.add("is-in");
      return;
    }
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          el.classList.add("is-in");
          io.disconnect();
        }
      },
      { threshold: 0.25, rootMargin: "0px 0px -10% 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <Tag ref={ref} className={cn("dt-reveal", className)}>
      {children}
    </Tag>
  );
}
