"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input } from "@/components/ui";
import { useToast } from "@/components/Toaster";
import { connectAppleCalendar } from "@/app/actions/connect";

/**
 * Apple has no OAuth for iCloud Calendar; its supported route for third-party apps is
 * CalDAV with an app-specific password the user creates at appleid.apple.com. This form
 * asks for exactly that — never the Apple ID password — verifies it against iCloud before
 * saving, and stores it encrypted. The user can revoke it from Apple at any time.
 */
export function AppleCalendarForm() {
  const [open, setOpen] = useState(false);
  const [appleId, setAppleId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();

  if (!open) return <Button size="sm" variant="outline" onClick={() => setOpen(true)}>Connect</Button>;

  return (
    <form
      className="w-full max-w-md space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const r = await connectAppleCalendar(appleId, password);
          if (r.error) return setError(r.error);
          setPassword("");
          setOpen(false);
          toast({ tone: "outcome", title: "Apple Calendar connected", body: "Bookings will appear on your calendar; its busy time blocks availability." });
          router.refresh();
        });
      }}
    >
      <p className="text-xs text-ink/60 leading-relaxed">
        Apple Calendar connects through iCloud with an <span className="font-semibold text-ink">app-specific password</span> — a separate password Apple issues for one app, which you can revoke any time. Create one at appleid.apple.com → Sign-In and Security → App-Specific Passwords. Never enter your Apple ID password here.
      </p>
      <Field id="apple-id" label="Apple ID email">
        <Input id="apple-id" type="email" autoComplete="off" value={appleId} onChange={(e) => setAppleId(e.target.value)} placeholder="you@icloud.com" required />
      </Field>
      <Field id="apple-pw" label="App-specific password" hint="Looks like abcd-efgh-ijkl-mnop">
        <Input id="apple-pw" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="abcd-efgh-ijkl-mnop" required />
      </Field>
      {error && <p role="alert" className="text-xs text-danger-text">{error}</p>}
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" loading={pending} loadingLabel="Checking with iCloud">Connect</Button>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-ink/50 px-2 py-1">Cancel</button>
      </div>
    </form>
  );
}
