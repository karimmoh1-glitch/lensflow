"use client";

import { useParallax } from "./useParallax";
import { OmnichannelHero } from "./OmnichannelHero";

export function HeroVisual() {
  const offset = useParallax(6);
  return (
    <div style={{ transform: `translateY(${offset}px)` }} className="w-full h-full">
      <OmnichannelHero />
    </div>
  );
}
