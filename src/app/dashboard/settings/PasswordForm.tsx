"use client";

import { useState, useTransition } from "react";
import { Button, Field, Input } from "@/components/ui";
import { useToast } from "@/components/Toaster";
import { changePassword } from "@/app/actions/settings";

/** Your own password, changed with the current one in hand. Other devices are signed out. */
export function PasswordForm({ email }: { email: string }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const { toast } = useToast();
  return (
    <section aria-label="Password" className="mt-8 rounded-[22px] border border-border bg-white px-5 py-5">
      <h2 className="text-sm font-semibold text-ink">Password</h2>
      <p className="mt-1 text-xs text-ink/70">For {email}. Changing it signs out every other device.</p>
      <form
        className="mt-4 grid sm:grid-cols-2 gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          start(async () => {
            const r = await changePassword({ current, next });
            if (r.error) return setError(r.error);
            setCurrent("");
            setNext("");
            toast({ tone: "outcome", title: "Password changed", body: "Other devices have been signed out." });
          });
        }}
      >
        <Field id="pw-current" label="Current password" error={error}><Input id="pw-current" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required className="text-[16px] md:text-sm" /></Field>
        <Field id="pw-next" label="New password" hint="At least 8 characters."><Input id="pw-next" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required minLength={8} className="text-[16px] md:text-sm" /></Field>
        <div className="sm:col-span-2"><Button type="submit" size="sm" loading={pending} loadingLabel="Saving" disabled={!current || next.length < 8}>Change password</Button></div>
      </form>
    </section>
  );
}
