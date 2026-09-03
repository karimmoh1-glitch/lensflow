"use client";

import { useParallax } from "./useParallax";
import { OmnichannelHero } from "./OmnichannelHero";

export function HeroVisual() {
  const offset = useParallax(6);
  return (
    <div style={{ transform: `translateY(${offset}px)` }} className="w-full h-full">
      {/* Starts almost immediately, right alongside the badge — the channel-icons-converging
          sequence and the headline landing are meant to read as one event, not visual-after-text. */}
      <OmnichannelHero startDelayMs={80} />
    </div>
  );
}
