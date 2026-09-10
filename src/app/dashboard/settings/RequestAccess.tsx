"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { useToast } from "@/components/Toaster";
import { requestIntegrationAccess } from "@/app/actions/accessRequests";
import type { IntegrationProvider } from "@prisma/client";

export type AccessModel = { status: "NONE" | "PENDING" | "APPROVED" | "REJECTED" | "REVOKED"; decisionNote: string | null; requestedAt: string | null };

/** Invite-only: ask, and see where the request stands. Only owners and admins can ask. */
export function RequestAccess({ provider, name, access, canAsk }: { provider: IntegrationProvider; name: string; access: AccessModel; canAsk: boolean }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();
  if (access.status === "PENDING") return <span className="inline-flex items-center h-8 px-3 rounded-full bg-accent-soft text-accent-text text-[12px] font-semibold">Access requested</span>;
  if (!canAsk) return null;
  const submit = () => start(async () => {
    const r = await requestIntegrationAccess(provider, note);
    if (!r.ok) return toast({ tone: "signal", title: "Couldn't send the request", body: r.error });
    toast({ tone: "outcome", title: `${name} access requested`, body: "Daythread will let you know here and by notification." });
    setOpen(false);
    router.refresh();
  });
  if (!open) return <Button size="sm" variant="outline" onClick={() => setOpen(true)}>{access.status === "REJECTED" || access.status === "REVOKED" ? "Request again" : "Request access"}</Button>;
  return (
    <div className="w-full sm:w-72 space-y-2">
      <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={2} placeholder={`How you use ${name} for your business (optional)`} className="w-full rounded-xl border border-border px-3 py-2 text-[13px] text-ink placeholder:text-ink/40 focus:outline-none focus:ring-2 focus:ring-accent/40" />
      <div className="flex gap-1.5">
        <Button size="sm" onClick={submit} loading={pending} loadingLabel="Sending">Send request</Button>
        <button type="button" onClick={() => setOpen(false)} className="text-[12px] text-ink/65 px-2">Cancel</button>
      </div>
    </div>
  );
}
