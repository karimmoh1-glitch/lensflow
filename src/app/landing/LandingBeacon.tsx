"use client";

import { useEffect } from "react";
import { recordLandingEvent } from "@/app/actions/landing";

/**
 * Two events from the landing page, and nothing else: that it was viewed, and that a
 * "start" link was clicked (with the scene it was in). A random id in session storage ties
 * the two together for one visit; it is never sent anywhere else and expires with the tab.
 */
function visitorId(): string | null {
  try {
    const key = "dt-visit";
    let id = sessionStorage.getItem(key);
    if (!id) {
      id = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, "0")).join("");
      sessionStorage.setItem(key, id);
    }
    return id;
  } catch {
    return null;
  }
}

export function LandingBeacon() {
  useEffect(() => {
    const id = visitorId();
    if (!id) return;
    try {
      if (!sessionStorage.getItem("dt-visit-sent")) {
        sessionStorage.setItem("dt-visit-sent", "1");
        void recordLandingEvent("landing_view", id);
      }
    } catch {
      void recordLandingEvent("landing_view", id);
    }
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement | null)?.closest?.("a[href='/signup']");
      if (!a) return;
      const source = a.closest("section[id], div[id], header, nav")?.id || (a.closest("nav") ? "nav" : "hero");
      void recordLandingEvent("landing_cta", id, source);
    };
    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, []);
  return null;
}
