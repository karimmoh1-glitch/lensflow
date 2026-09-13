"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { ChevronsUpDown, Check } from "lucide-react";
import { switchWorkspace } from "@/app/actions/workspace";

export type WorkspaceOption = { businessId: string; name: string; role: string };

/**
 * A menu of the workspaces this person belongs to. A menu, not a dialog: it opens from its
 * button, arrow keys move between workspaces, Escape closes it and puts focus back on the
 * button, and a click anywhere else closes it.
 */
export function WorkspaceSwitcher({ current, workspaces }: { current: string; workspaces: WorkspaceOption[] }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const items = () => [...(menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])];
    items()[Math.max(0, workspaces.findIndex((w) => w.name === current))]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        button.current?.focus();
        return;
      }
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      e.preventDefault();
      const list = items();
      const i = list.indexOf(document.activeElement as HTMLButtonElement);
      list[(i + (e.key === "ArrowDown" ? 1 : -1) + list.length) % list.length]?.focus();
    };
    const onDown = (e: MouseEvent) => {
      if (!menu.current?.contains(e.target as Node) && !button.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open, current, workspaces]);

  return (
    <div className="relative px-3">
      <button
        ref={button}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? `${id}-menu` : undefined}
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 min-h-[32px] text-xs font-medium text-ink/65 hover:text-ink px-2 py-1.5 rounded-md hover:bg-black/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/70"
      >
        <span className="truncate"><span className="sr-only">Workspace: </span>{current}</span>
        <ChevronsUpDown className="w-3.5 h-3.5 shrink-0" strokeWidth={2} aria-hidden />
      </button>

      {open && (
        <div ref={menu} id={`${id}-menu`} role="menu" aria-label="Switch workspace" className="absolute bottom-full left-3 right-3 mb-1 z-50 rounded-lg border border-border bg-white shadow-overlay py-1">
          {workspaces.map((w) => (
            <button
              key={w.businessId}
              type="button"
              role="menuitem"
              aria-current={w.name === current ? "true" : undefined}
              disabled={pending}
              onClick={() =>
                startTransition(() => {
                  switchWorkspace(w.businessId);
                })
              }
              className="w-full flex items-center justify-between gap-2 px-3 py-2 min-h-[36px] text-sm text-left hover:bg-black/[0.04] focus-visible:outline-none focus-visible:bg-black/[0.05]"
            >
              <span className="truncate">{w.name}</span>
              {w.name === current && <Check className="w-3.5 h-3.5 text-ink shrink-0" strokeWidth={2} aria-hidden />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
