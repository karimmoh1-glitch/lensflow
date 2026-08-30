"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export function useActiveStep(count: number) {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const idx = refs.current.findIndex((el) => el === entry.target);
            if (idx !== -1) setActive(idx);
          }
        }
      },
      { rootMargin: "-42% 0px -42% 0px", threshold: 0 }
    );
    refs.current.slice(0, count).forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, [count]);

  return { active, refs };
}

export function StoryStep({
  index,
  refs,
  eyebrow,
  title,
  body,
}: {
  index: number;
  refs: React.MutableRefObject<(HTMLDivElement | null)[]>;
  eyebrow: string;
  title: string;
  body: string;
}) {
  return (
    <div
      ref={(el) => {
        refs.current[index] = el;
      }}
    >
      <div className="text-xs font-medium text-accent-text mb-2">{eyebrow}</div>
      <h3 className="font-display text-2xl md:text-3xl text-ink mb-2">{title}</h3>
      <p className="text-sm text-ink/55 max-w-xs">{body}</p>
    </div>
  );
}

export function StoryLayout({
  visual,
  children,
  visualFirst,
}: {
  visual: React.ReactNode;
  children: React.ReactNode;
  visualFirst?: boolean;
}) {
  return (
    <div className="grid md:grid-cols-2 gap-10 md:gap-16 items-start max-w-5xl mx-auto px-6">
      <div className={cn("flex justify-center sticky top-24 self-start", visualFirst ? "order-1" : "order-1 md:order-2")}>{visual}</div>
      <div className={cn("flex flex-col gap-16 md:gap-20 py-6", visualFirst ? "order-2" : "order-2 md:order-1")}>{children}</div>
    </div>
  );
}
