"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input } from "@/components/ui";
import { useToast } from "@/components/Toaster";
import { connectAppleCalendar } from "@/app/actions/connect";
import { CalendarSetup } from "./CalendarSetup";

/**
 * Apple has no OAuth for iCloud Calendar; its supported route for third-party apps is
 * CalDAV with an app-specific password the user creates at Apple. This asks for exactly
 * that, verifies it against iCloud before anything is stored, stores it encrypted, and
 * then moves straight into choosing calendars.
 */
export function AppleConnectDialog({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<"credentials" | "calendars">("credentials");
  const [appleId, setAppleId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();

  if (step === "calendars") {
    return <CalendarSetup provider="APPLE_CALENDAR" mode="setup" onDone={() => { router.refresh(); onClose(); }} />;
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const r = await connectAppleCalendar(appleId, password);
          if (r.error) return setError(r.error);
          setPassword("");
          toast({ tone: "outcome", title: "Apple Calendar connected", body: `${r.calendars?.length ?? 0} calendar${r.calendars?.length === 1 ? "" : "s"} found. Choose which to use.` });
          setStep("calendars");
        });
      }}
    >
      <ol className="space-y-2 text-sm text-ink/75">
        {[
          <>Enter the email address of your Apple ID.</>,
          <>Create an Apple <span className="font-semibold text-ink">app-specific password</span> at <a href="https://account.apple.com/account/manage" target="_blank" rel="noreferrer" className="text-signal-text font-semibold hover:underline">account.apple.com</a> → Sign-In and Security → App-Specific Passwords. Name it &ldquo;Daythread&rdquo;.</>,
          <>Paste that password below. It only works for this app and you can revoke it at Apple any time.</>,
          <>Daythread verifies the connection with iCloud, then you choose which calendars to sync.</>,
        ].map((t, i) => (
          <li key={i} className="flex gap-3"><span className="w-5 h-5 rounded-full bg-ink text-white text-[10px] font-extrabold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span><span>{t}</span></li>
        ))}
      </ol>
      <div className="rounded-xl bg-warning-soft/50 border border-warning/30 px-3 py-2 text-xs text-ink/75"><span className="font-semibold text-ink">Never enter your normal Apple ID password here.</span> Daythread only accepts app-specific passwords, which are stored encrypted.</div>
      <Field id="apple-id" label="Apple ID email">
        <Input id="apple-id" type="email" autoComplete="off" value={appleId} onChange={(e) => setAppleId(e.target.value)} placeholder="you@icloud.com" required />
      </Field>
      <Field id="apple-pw" label="App-specific password" hint="Looks like abcd-efgh-ijkl-mnop">
        <Input id="apple-pw" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="abcd-efgh-ijkl-mnop" required />
      </Field>
      {error && <p role="alert" className="text-xs text-danger-text">{error}</p>}
      <div className="flex items-center gap-2 pt-1">
        <Button type="submit" loading={pending} loadingLabel="Checking with iCloud">Connect Apple Calendar</Button>
        <button type="button" onClick={onClose} className="text-xs text-ink/50 px-2 py-1">Cancel</button>
      </div>
    </form>
  );
}
