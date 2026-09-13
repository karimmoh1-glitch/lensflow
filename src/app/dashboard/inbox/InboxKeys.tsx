"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Keyboard movement through the list: j / ↓ for the next conversation, k / ↑ for the
 * previous one. Ignored while typing, and whenever a modifier is held, so it never fights
 * the composer, search or the command palette.
 */
export function InboxKeys() {
  const router = useRouter();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) return;
      const next = e.key === "j" || e.key === "ArrowDown";
      const prev = e.key === "k" || e.key === "ArrowUp";
      if (!next && !prev) return;
      const links = [...document.querySelectorAll<HTMLAnchorElement>('ol[aria-label="Conversations"] a[href]')];
      if (links.length === 0) return;
      const i = links.findIndex((a) => a.getAttribute("aria-current") === "true");
      const target = links[i === -1 ? 0 : Math.max(0, Math.min(links.length - 1, i + (next ? 1 : -1)))];
      if (!target || (i !== -1 && target === links[i])) return;
      e.preventDefault();
      target.scrollIntoView({ block: "nearest" });
      router.push(target.getAttribute("href")!, { scroll: false });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);
  return null;
}
