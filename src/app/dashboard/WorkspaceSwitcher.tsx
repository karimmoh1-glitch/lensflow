"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { ChevronsUpDown, Check } from "lucide-react";
import { DaythreadMark } from "@/components/brand/DaythreadLogo";
import { switchWorkspace } from "@/app/actions/workspace";

export type WorkspaceOption = { businessId: string; name: string; role: string };

/**
 * A menu of the workspaces this person belongs to. A menu, not a dialog: it opens from its
 * button, arrow keys move between workspaces, Escape closes it and puts focus back on the
 * button, and a click anywhere else closes it.
 */
export function WorkspaceSwitcher({ current, workspaces, placement = "above" }: { current: string; workspaces: WorkspaceOption[]; placement?: "above" | "below" }) {
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
    <div className="relative">
      <button
        ref={button}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? `${id}-menu` : undefined}
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2.5 h-9 px-2 rounded text-13 font-semibold text-ink hover:bg-ink/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/70"
      >
        <DaythreadMark className="w-[18px] h-[18px] text-ink shrink-0" />
        <span className="truncate flex-1 text-left"><span className="sr-only">Workspace: </span>{current}</span>
        <ChevronsUpDown className="w-3.5 h-3.5 shrink-0 text-ink/55" strokeWidth={1.75} aria-hidden />
      </button>

      {open && (
        <div ref={menu} id={`${id}-menu`} role="menu" aria-label="Switch workspace" className={`absolute left-0 right-0 z-50 rounded-lg bg-white shadow-popover p-1 ${placement === "below" ? "top-full mt-1" : "bottom-full mb-1"}`}>
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
              className="w-full flex items-center justify-between gap-2 px-2 h-9 rounded text-13 text-left hover:bg-ink/[0.05] focus-visible:outline-none focus-visible:bg-ink/[0.06]"
            >
              <span className="truncate">{w.name}</span>
              {w.name === current && <Check className="w-3.5 h-3.5 text-ink shrink-0" strokeWidth={1.75} aria-hidden />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
