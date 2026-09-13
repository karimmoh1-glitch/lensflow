"use client";

import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * What every modal owes a keyboard and a screen reader, in one place: focus moves inside on
 * open (to `[data-autofocus]` if there is one), Tab and Shift+Tab stay inside, Escape
 * closes, the page behind stops scrolling, and focus returns to whatever opened it. The
 * dialog, the bottom sheet and the integration sheet each draw their own frame and share
 * this, so none of them can drift from the others.
 */
export function useModalFocus(ref: RefObject<HTMLElement | null>, open: boolean, onClose: () => void) {
  const latestClose = useRef(onClose);
  latestClose.current = onClose;

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // The panel may mount a frame later (a portal): look for it on the next frame too.
    const focusFirst = () => {
      const el = ref.current;
      if (!el) return false;
      const target = el.querySelector<HTMLElement>("[data-autofocus]") ?? el.querySelector<HTMLElement>(FOCUSABLE) ?? el;
      if (target === el && !el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
      target.focus({ preventScroll: true });
      return true;
    };
    let raf = 0;
    if (!focusFirst()) raf = requestAnimationFrame(focusFirst);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        latestClose.current();
        return;
      }
      const el = ref.current;
      if (e.key !== "Tab" || !el) return;
      const items = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((n) => n.getClientRects().length > 0);
      if (items.length === 0) {
        e.preventDefault();
        el.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const inside = el.contains(document.activeElement);
      if (e.shiftKey && (document.activeElement === first || !inside)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !inside)) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      if (opener && document.contains(opener)) opener.focus({ preventScroll: true });
    };
  }, [open, ref]);
}
