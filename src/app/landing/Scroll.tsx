"use client";

import { useEffect, useRef, type CSSProperties, type HTMLAttributes, type ReactNode, type RefObject } from "react";

/**
 * Scroll-linked scenes, with one listener for the whole page.
 *
 * A scene is an element whose `--p` custom property runs 0 → 1 as it travels through the
 * viewport. Everything inside animates from that number in CSS (see `.dt-step` in
 * globals.css): transform and opacity only, no transitions, so the picture is wherever the
 * scroll is — move fast and it moves fast, stop and it holds, scroll back and it rewinds.
 * Normal scrolling is never intercepted.
 *
 * Cost: one passive scroll listener and one requestAnimationFrame for the page, attached
 * only while at least one scene is near the viewport (an IntersectionObserver adds and
 * removes them). Nothing in React re-renders on scroll. Under prefers-reduced-motion
 * nothing is measured: `--p` is set to the scene's resting value and the CSS shows the
 * finished layout.
 *
 * Spans:
 *   pin      a section taller than the viewport with a sticky child: 0 when its top reaches
 *            the top of the viewport, 1 when its bottom does (the pinned stretch)
 *   enter    0 as the top of the section enters at the bottom of the viewport, 1 when it
 *            reaches `settle` × the viewport height from the top
 *   through  0 as the section enters at the bottom, 1 as it leaves at the top
 *   leave    0 with the section at rest at the top of the page, 1 once it has scrolled
 *            `settle` × the viewport height upward (the hero)
 */
export type Span = "pin" | "enter" | "through" | "leave";

type Scene = { el: HTMLElement; span: Span; settle: number; steps?: number[]; onStep?: (step: number) => void; step: number };

const active = new Set<Scene>();
let frame = 0;
let listening = false;

const clamp = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

function progress(s: Scene, vh: number): number {
  const r = s.el.getBoundingClientRect();
  switch (s.span) {
    case "pin":
      return clamp(-r.top / Math.max(r.height - vh, 1));
    case "enter":
      return clamp((vh - r.top) / Math.max(vh * (1 - s.settle), 1));
    case "through":
      return clamp((vh - r.top) / Math.max(vh + r.height, 1));
    case "leave":
      return clamp(-r.top / Math.max(vh * s.settle, 1));
  }
}

function apply(s: Scene, vh: number) {
  const p = progress(s, vh);
  s.el.style.setProperty("--p", p.toFixed(4));
  if (s.steps) {
    let i = 0;
    while (i < s.steps.length && p >= s.steps[i]) i++;
    if (i !== s.step) {
      s.step = i;
      s.onStep?.(i);
    }
  }
}

function tick() {
  frame = 0;
  const vh = window.innerHeight;
  for (const s of active) apply(s, vh);
}

function schedule() {
  if (!frame) frame = requestAnimationFrame(tick);
}

function listen(on: boolean) {
  if (on === listening) return;
  listening = on;
  if (on) {
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
  } else {
    window.removeEventListener("scroll", schedule);
    window.removeEventListener("resize", schedule);
  }
}

export type SceneOptions = {
  span?: Span;
  /** For `enter` and `leave`: the fraction of the viewport height the travel covers. */
  settle?: number;
  /** The value `--p` rests at under reduced motion and before JavaScript runs. */
  rest?: number;
  /** Thresholds of `--p`; `onStep(i)` fires when the number of thresholds passed changes. */
  steps?: number[];
  onStep?: (step: number) => void;
};

export function useScrollScene<T extends HTMLElement>(ref: RefObject<T | null>, { span = "enter", settle = 0.35, rest = 1, steps, onStep }: SceneOptions = {}) {
  const latest = useRef(onStep);
  latest.current = onStep;
  const stepsKey = steps?.join(",") ?? "";
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.style.setProperty("--p", String(rest));
      return;
    }
    const scene: Scene = { el, span, settle, steps: stepsKey ? stepsKey.split(",").map(Number) : undefined, onStep: (i) => latest.current?.(i), step: -1 };
    // Measured once on mount so the first paint after hydration is already right.
    apply(scene, window.innerHeight);
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          active.add(scene);
          listen(true);
          schedule();
        } else {
          active.delete(scene);
          if (active.size === 0) listen(false);
          // Settle at the true value on the way out, so a fast fling never leaves it midway.
          apply(scene, window.innerHeight);
        }
      },
      { rootMargin: "40% 0px 40% 0px" }
    );
    io.observe(el);
    return () => {
      io.disconnect();
      active.delete(scene);
      if (active.size === 0) listen(false);
    };
  }, [ref, span, settle, rest, stepsKey]);
}

type SceneProps = SceneOptions & Omit<HTMLAttributes<HTMLElement>, "style"> & { as?: "div" | "section"; style?: CSSProperties; children: ReactNode };

/** A scene root: sets `--p` on itself; children animate from it in CSS. */
export function ScrollScene({ as: Tag = "div", span, settle, rest = 1, steps, onStep, style, children, ...attrs }: SceneProps) {
  const ref = useRef<HTMLElement>(null);
  useScrollScene(ref, { span, settle, rest, steps, onStep });
  return (
    <Tag ref={ref as RefObject<HTMLDivElement>} style={{ ["--p" as string]: rest, ...style }} {...attrs}>
      {children}
    </Tag>
  );
}
