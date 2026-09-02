"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { syncGmailNow } from "@/app/actions/googleAuth";

const POLL_MS = 20_000;

/**
 * Renders nothing — just keeps a connected Gmail account's inbox current without a
 * manual click. Polls the same real syncGmailNow() the "Check for new emails" button
 * calls, on an interval, and only refreshes the page when it actually finds something
 * new so an in-progress reply draft is never disturbed. Stops polling while the tab is
 * hidden so it doesn't burn API quota in a background tab.
 */
export function AutoGmailSync() {
  const router = useRouter();
  const inFlight = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function tick() {
      if (inFlight.current || cancelled || document.hidden) return;
      inFlight.current = true;
      try {
        const result = await syncGmailNow();
        if (!cancelled && result.ok && result.ingested > 0) {
          router.refresh();
        }
      } catch {
        // A transient failure here just means we try again next tick — no need to
        // surface it since the manual "Check for new emails" button already reports
        // real errors when someone's actively looking.
      } finally {
        inFlight.current = false;
      }
    }

    const interval = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [router]);

  return null;
}
