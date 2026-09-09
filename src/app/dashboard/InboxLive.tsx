"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * Keeps the dashboard current without a click: one event stream per visible tab, a
 * refresh when the workspace's inbox version moves. Closed while the tab is hidden,
 * reopened (with one catch-up refresh) when it is visible again or the network returns.
 * Refreshes are coalesced so a burst of messages costs one render, and an in-progress
 * draft is never disturbed because a refresh keeps client state.
 */
const MIN_REFRESH_GAP_MS = 1500;

export function InboxLive() {
  const router = useRouter();
  const source = useRef<EventSource | null>(null);
  const version = useRef<number | null>(null);
  const lastRefresh = useRef(0);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let stopped = false;
    const refresh = () => {
      const wait = Math.max(0, MIN_REFRESH_GAP_MS - (Date.now() - lastRefresh.current));
      if (pending.current) return;
      pending.current = setTimeout(() => { pending.current = null; lastRefresh.current = Date.now(); router.refresh(); }, wait);
    };
    const close = () => { source.current?.close(); source.current = null; };
    const open = () => {
      if (stopped || document.hidden || source.current || typeof EventSource === "undefined") return;
      const es = new EventSource(`/api/inbox/events${version.current !== null ? `?since=${version.current}` : ""}`);
      es.addEventListener("hello", (e) => { if (version.current === null) version.current = Number((e as MessageEvent).data); });
      es.addEventListener("version", (e) => {
        const v = Number((e as MessageEvent).data);
        if (version.current === null || v !== version.current) { version.current = v; refresh(); }
      });
      es.onerror = () => { /* EventSource reconnects on its own; a closed stream is normal */ };
      source.current = es;
    };
    const onVisibility = () => { if (document.hidden) close(); else { open(); refresh(); } };
    const onOnline = () => { close(); open(); refresh(); };
    open();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);
    window.addEventListener("focus", open);
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("focus", open);
      if (pending.current) clearTimeout(pending.current);
      close();
    };
  }, [router]);

  return null;
}
