"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { Link as NavLink } from "@/content/founder/profile";

/**
 * The profile's header: the name, four anchors, and on small screens a disclosure menu. The
 * menu is a real disclosure: the button says whether it is open, Escape closes it and returns
 * focus, choosing a destination closes it. Without JavaScript the anchors are still links.
 */
export function FounderHeader({ name, links }: { name: string; links: NavLink[] }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header className="fp-header">
      <div className="fp-wrap fp-header-row">
        <a href="#top" className="fp-header-name">{name}</a>
        <nav aria-label="Profile sections" className="fp-nav-desktop">
          <ul>
            {links.map((l) => (
              <li key={l.href}><a href={l.href}>{l.label}</a></li>
            ))}
          </ul>
        </nav>
        <button ref={button} type="button" className="fp-menu-button" aria-expanded={open} aria-controls={`${id}-menu`} onClick={() => setOpen((v) => !v)}>
          <span>{open ? "Close" : "Menu"}</span>
          <span aria-hidden className="fp-menu-glyph" data-open={open} />
        </button>
      </div>
      <nav id={`${id}-menu`} aria-label="Profile sections" className="fp-nav-mobile" hidden={!open}>
        <ul className="fp-wrap">
          {links.map((l, i) => (
            <li key={l.href}>
              <a href={l.href} onClick={() => setOpen(false)}>
                <span className="fp-mono" aria-hidden>{String(i + 1).padStart(2, "0")}</span>
                {l.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
