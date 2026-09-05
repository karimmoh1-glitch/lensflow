"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Input } from "@/components/ui";
import { useToast } from "@/components/Toaster";
import { searchSmsNumbers, claimSmsNumber, releaseSmsNumber } from "@/app/actions/connect";

/** A dedicated text number for the business, from Daythread's own Twilio account. */
export function SmsNumberPicker({ current }: { current: string | null }) {
  const [areaCode, setAreaCode] = useState("");
  const [numbers, setNumbers] = useState<Array<{ phoneNumber: string; friendlyName: string; locality: string | null; region: string | null }> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  if (current) {
    return (
      <div className="flex items-center gap-3 flex-wrap text-xs">
        <span className="text-ink/60">Your number</span>
        <span className="font-semibold text-ink tabular-nums">{current}</span>
        {!confirm ? (
          <button type="button" onClick={() => setConfirm(true)} className="text-ink/50 hover:text-ink">Release number</button>
        ) : (
          <span className="inline-flex items-center gap-2">
            <span className="text-ink/60">Texts to it will stop.</span>
            <Button size="sm" variant="danger" loading={pending} loadingLabel="Releasing" onClick={() => start(async () => { const r = await releaseSmsNumber(); if (r.error) return toast({ tone: "signal", title: "Couldn't release", body: r.error }); toast({ tone: "neutral", title: "Number released" }); router.refresh(); })}>Release</Button>
            <button type="button" onClick={() => setConfirm(false)} className="text-ink/50">Keep</button>
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <Input value={areaCode} onChange={(e) => setAreaCode(e.target.value)} placeholder="Area code (optional)" inputMode="numeric" className="h-8 w-40 text-xs" />
        <Button size="sm" variant="outline" loading={pending && numbers === null} loadingLabel="Searching" onClick={() => start(async () => { setError(null); const r = await searchSmsNumbers(areaCode); if (r.error) setError(r.error); setNumbers(r.numbers); })}>Find a number</Button>
      </div>
      {error && <p className="text-xs text-warning-text">{error}</p>}
      {numbers && numbers.length === 0 && !error && <p className="text-xs text-ink/55">No numbers found for that area code — try another.</p>}
      {numbers && numbers.length > 0 && (
        <ul className="grid sm:grid-cols-2 gap-1.5">
          {numbers.map((n) => (
            <li key={n.phoneNumber} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-white px-3 py-2 text-xs">
              <span><span className="font-semibold text-ink tabular-nums">{n.friendlyName}</span><span className="text-ink/50"> · {[n.locality, n.region].filter(Boolean).join(", ")}</span></span>
              <Button size="sm" loading={pending} loadingLabel="Getting it" onClick={() => start(async () => { const r = await claimSmsNumber(n.phoneNumber); if (r.error) return toast({ tone: "signal", title: "Couldn't get that number", body: r.error }); toast({ tone: "outcome", title: `${r.phoneNumber} is yours`, body: "Texts to it land in your inbox." }); router.refresh(); })}>Use this</Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
