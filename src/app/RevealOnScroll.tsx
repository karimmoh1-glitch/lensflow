"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * One-shot "animate in when it first enters the viewport" wrapper — for the static
 * sections that aren't already driven by the scroll-story mechanism (pricing cards, etc).
 * transform+opacity only, IntersectionObserver-gated (fires once, then disconnects), and
 * a no-op under prefers-reduced-motion (content is visible immediately, no motion).
 */
export function RevealOnScroll({
  children,
  delay = 0,
  className,
  as: Tag = "div",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  as?: "div" | "li";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setReducedMotion(reduced);
    if (reduced) {
      setVisible(true);
      return;
    }
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const Comp = Tag as "div";
  return (
    <Comp
      ref={ref}
      className={cn(
        "transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]",
        visible || reducedMotion ? "opacity-100 translate-y-0 scale-100" : "opacity-0 translate-y-5 scale-[0.98]",
        className
      )}
      style={{ transitionDelay: visible ? `${delay}ms` : "0ms" }}
    >
      {children}
    </Comp>
  );
}
