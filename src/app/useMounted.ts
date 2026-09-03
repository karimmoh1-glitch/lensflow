"use client";

import { useEffect, useState } from "react";

/** True once the component has mounted client-side — the standard trigger for a one-shot
 * entrance animation (render hidden on first paint, then flip to visible a frame later so
 * the CSS transition actually runs). Reduced-motion users get `true` immediately: content
 * still shows up right away, just without the animated entrance. */
export function useMounted() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setMounted(true);
      return;
    }
    const t = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(t);
  }, []);

  return mounted;
}
