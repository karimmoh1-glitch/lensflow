"use client";

import { useState, useTransition } from "react";
import { ChevronsUpDown, Check } from "lucide-react";
import { switchWorkspace } from "@/app/actions/workspace";

export type WorkspaceOption = { businessId: string; name: string; role: string };

export function WorkspaceSwitcher({ current, workspaces }: { current: string; workspaces: WorkspaceOption[] }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <div className="relative px-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 text-xs font-medium text-ink/60 hover:text-ink px-2 py-1.5 rounded-md hover:bg-black/[0.05]"
      >
        <span className="truncate">{current}</span>
        <ChevronsUpDown className="w-3.5 h-3.5 shrink-0" strokeWidth={2} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full left-3 right-3 mb-1 z-50 rounded-lg border border-border bg-white shadow-popover py-1">
            {workspaces.map((w) => (
              <button
                key={w.businessId}
                disabled={pending}
                onClick={() =>
                  startTransition(() => {
                    switchWorkspace(w.businessId);
                  })
                }
                className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-left hover:bg-black/[0.04]"
              >
                <span className="truncate">{w.name}</span>
                {w.name === current && <Check className="w-3.5 h-3.5 text-accent-text shrink-0" strokeWidth={2} />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
