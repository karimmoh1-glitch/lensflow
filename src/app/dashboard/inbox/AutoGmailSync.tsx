"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { reconcileChannels } from "@/app/actions/sync";

const POLL_MS = 120_000;

/**
 * Renders nothing. The normal path is provider webhooks plus the live stream (InboxLive);
 * this is the bounded fallback for providers that only offer polling (Gmail) — the same
 * throttled reconciliation the "Check for messages" button runs, every two minutes while
 * the tab is visible. Refreshes only when something new actually landed.
 */
export function AutoGmailSync({ immediate = false }: { immediate?: boolean }) {
  const router = useRouter();
  const inFlight = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function tick() {
      if (inFlight.current || cancelled || document.hidden) return;
      inFlight.current = true;
      try {
        const result = await reconcileChannels();
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

    // On open: pull right away so what's on screen is today's mail, not the last visit's.
    const first = immediate ? setTimeout(tick, 800) : null;
    const interval = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      if (first) clearTimeout(first);
      clearInterval(interval);
    };
  }, [router, immediate]);

  return null;
}
