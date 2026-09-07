"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * The thread that runs through the whole page. A fixed hairline at the left edge on wide
 * screens: it fills with the brand gradient as you scroll, and a node for each scene lights
 * up as that scene is on screen. It is the story's progress indicator and a way to jump
 * between scenes; it never covers content (only shown when the margins are wide enough).
 * Reduced motion: no transitions, still functional.
 */
export const SCENES: Array<{ id: string; label: string }> = [
  { id: "top", label: "Everywhere" },
  { id: "story", label: "One thread" },
  { id: "demo", label: "The inbox" },
  { id: "calendar", label: "Calendar" },
  { id: "how", label: "Automations" },
  { id: "assistant", label: "Assistant" },
  { id: "pricing", label: "Pricing" },
  { id: "end", label: "Meet Daythread" },
];

export function Spine() {
  const [progress, setProgress] = useState(0);
  const [active, setActive] = useState("top");
  const ticking = useRef(false);

  useEffect(() => {
    const onScroll = () => {
      if (ticking.current) return;
      ticking.current = true;
      requestAnimationFrame(() => {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        setProgress(max > 0 ? Math.max(0, Math.min(1, window.scrollY / max)) : 0);
        // The scene whose top has passed the middle of the viewport is the active one.
        let current = SCENES[0].id;
        for (const s of SCENES) {
          const el = document.getElementById(s.id);
          if (el && el.getBoundingClientRect().top <= window.innerHeight * 0.5) current = s.id;
        }
        setActive(current);
        ticking.current = false;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  // On the dark closing sheet the spine turns light so it stays visible.
  const dark = active === "end";
  return (
    <nav aria-label="Scenes" data-dark={dark || undefined} className="hidden min-[1360px]:flex fixed left-7 top-1/2 -translate-y-1/2 z-30 flex-col items-start pointer-events-none">
      <div className="relative flex flex-col justify-between h-[44vh] py-1">
        <span aria-hidden className={cn("absolute left-[5px] top-1 bottom-1 w-px", dark ? "bg-paper/15" : "bg-ink/10")} />
        <span aria-hidden className="absolute left-[5px] top-1 bottom-1 w-px origin-top bg-gradient-to-b from-accent via-signal to-success motion-safe:transition-transform motion-safe:duration-150" style={{ transform: `scaleY(${progress})` }} />
        {SCENES.map((s) => {
          const on = active === s.id;
          return (
            <a
              key={s.id}
              href={`#${s.id}`}
              aria-current={on ? "location" : undefined}
              className="group pointer-events-auto relative flex items-center gap-3 h-3 focus-visible:outline-none"
            >
              <span
                aria-hidden
                className={cn(
                  "block rounded-full ring-[3px] motion-safe:transition-all motion-safe:duration-300 motion-safe:ease-[cubic-bezier(0.22,1.2,0.36,1)]",
                  dark ? "ring-midnight" : "ring-paper",
                  on ? "w-[11px] h-[11px] bg-accent ml-0" : cn("w-[7px] h-[7px] ml-[2px]", dark ? "bg-paper/30 group-hover:bg-paper/70" : "bg-ink/25 group-hover:bg-ink/60")
                )}
              />
              <span
                className={cn(
                  "text-[11px] font-bold uppercase tracking-[0.14em] whitespace-nowrap motion-safe:transition-all motion-safe:duration-300 group-focus-visible:opacity-100 group-focus-visible:translate-x-0",
                  on ? cn("opacity-100 translate-x-0", dark ? "text-paper" : "text-ink") : cn("opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0", dark ? "text-paper/70" : "text-ink/60")
                )}
              >
                {s.label}
              </span>
            </a>
          );
        })}
      </div>
    </nav>
  );
}
