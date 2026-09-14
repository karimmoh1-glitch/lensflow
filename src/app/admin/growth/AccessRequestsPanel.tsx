"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { decideIntegrationAccess } from "@/app/actions/accessRequests";
import { cn } from "@/lib/utils";

export type AccessRow = { id: string; provider: string; status: string; note: string | null; decisionNote: string | null; createdAt: string; reviewedAt: string | null; business: { name: string; handle: string; planTier: string }; requester: string | null };

/** Founder-only: the invite-only queue. Approve, decline, or pause an approval; the workspace is told each time. */
export function AccessRequestsPanel({ rows }: { rows: AccessRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const decide = (id: string, decision: "APPROVED" | "REJECTED" | "REVOKED") => {
    setBusy(id);
    setError(null);
    start(async () => {
      const r = await decideIntegrationAccess(id, decision, notes[id]);
      if (!r.ok) setError(r.error);
      setBusy(null);
      router.refresh();
    });
  };
  const tone = (s: string) => (s === "APPROVED" ? "bg-success-soft text-success-text" : s === "PENDING" ? "bg-accent-soft text-accent-text" : "bg-black/[0.05] text-ink/70");
  return (
    <div className="rounded-[22px] border border-border bg-white px-5 py-4">
      {error && <p role="alert" className="mb-3 text-xs text-warning-text">{error}</p>}
      {rows.length === 0 ? (
        <p className="text-sm text-ink/65">No access requests yet.</p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((r) => (
            <li key={r.id} className="py-3 flex flex-col gap-2 md:flex-row md:items-start md:gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-ink">{r.business.name}</span>
                  <span className="text-[11px] text-ink/65">/{r.business.handle} · {r.business.planTier}</span>
                  <span className={cn("text-[10px] font-bold uppercase tracking-[0.1em] rounded-full px-2 py-0.5", tone(r.status))}>{r.status.toLowerCase()}</span>
                </div>
                <p className="mt-0.5 text-[12px] text-ink/70">{r.provider} · asked {new Date(r.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}{r.requester ? ` by ${r.requester}` : ""}{r.reviewedAt ? ` · decided ${new Date(r.reviewedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}</p>
                {r.note && <p className="mt-1 text-[12px] text-ink/80 whitespace-pre-wrap">&ldquo;{r.note}&rdquo;</p>}
                {r.decisionNote && <p className="mt-1 text-[12px] text-ink/65">Note sent: {r.decisionNote}</p>}
              </div>
              <div className="flex flex-col gap-1.5 shrink-0 md:w-64">
                <input value={notes[r.id] ?? ""} onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })} placeholder="Note to the workspace (optional)" maxLength={300} className="h-8 rounded-lg border border-border px-2.5 text-[12px] text-ink placeholder:text-ink/40 focus:outline-none focus:ring-2 focus:ring-accent/40" />
                <div className="flex gap-1.5">
                  {r.status !== "APPROVED" && <button type="button" disabled={pending && busy === r.id} onClick={() => decide(r.id, "APPROVED")} className="h-8 px-3 rounded-full bg-ink text-white text-[12px] font-semibold disabled:opacity-60">Approve</button>}
                  {r.status === "PENDING" && <button type="button" disabled={pending && busy === r.id} onClick={() => decide(r.id, "REJECTED")} className="h-8 px-3 rounded-full border border-border text-[12px] font-semibold text-ink disabled:opacity-60">Decline</button>}
                  {r.status === "APPROVED" && <button type="button" disabled={pending && busy === r.id} onClick={() => decide(r.id, "REVOKED")} className="h-8 px-3 rounded-full border border-border text-[12px] font-semibold text-ink disabled:opacity-60">Revoke</button>}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
