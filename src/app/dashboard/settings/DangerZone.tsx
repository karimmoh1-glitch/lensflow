"use client";

import { useState, useTransition } from "react";
import { Button, Input } from "@/components/ui";
import { deleteWorkspace } from "@/app/actions/settings";

/** Deleting a workspace is permanent and is described exactly in /privacy. */
export function DangerZone({ businessName }: { businessName: string }) {
  const [typed, setTyped] = useState("");
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <section aria-label="Delete workspace" className="mt-10 rounded-[22px] border border-danger/30 bg-white px-5 py-4">
      <h3 className="text-sm font-semibold text-ink">Delete this workspace</h3>
      <p className="mt-1 text-xs text-ink/60 leading-relaxed">Permanently removes {businessName}: people, conversations, messages, bookings, payments, notes, automations, connected-account credentials, and the calendar events Daythread created. Connected providers are told to stop where they support it. This cannot be undone.</p>
      {!open ? (
        <div className="mt-3"><Button variant="outline" size="sm" onClick={() => setOpen(true)}>Delete workspace…</Button></div>
      ) : (
        <div className="mt-3 space-y-2">
          <label htmlFor="confirm-delete" className="text-xs text-ink/70">Type <span className="font-semibold text-ink">{businessName}</span> to confirm</label>
          <Input id="confirm-delete" value={typed} onChange={(e) => setTyped(e.target.value)} className="max-w-sm" />
          {error && <p role="alert" className="text-xs text-danger-text">{error}</p>}
          <div className="flex items-center gap-2">
            <Button variant="danger" size="sm" disabled={typed !== businessName} loading={pending} loadingLabel="Deleting" onClick={() => start(async () => { const r = await deleteWorkspace(typed); if (r?.error) setError(r.error); })}>Delete permanently</Button>
            <button type="button" onClick={() => setOpen(false)} className="text-xs text-ink/50">Cancel</button>
          </div>
        </div>
      )}
    </section>
  );
}
