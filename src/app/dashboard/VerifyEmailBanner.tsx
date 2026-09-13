"use client";

import { useState, useTransition } from "react";
import { MailCheck } from "lucide-react";
import { resendVerification } from "@/app/actions/auth";

/**
 * Shown to an owner whose address isn't proven yet, only where email is live enough for a
 * link to arrive. Nothing about the inbox waits on it; sending invitations from Daythread
 * does. A resend is throttled per address across every instance.
 */
export function VerifyEmailBanner({ email }: { email: string }) {
  const [note, setNote] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div role="status" className="flex items-center gap-3 px-4 md:px-8 py-2 border-b border-border bg-paper text-13 text-ink/70">
      <MailCheck className="w-4 h-4 text-ink/55 shrink-0" strokeWidth={1.75} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="font-medium text-ink">Confirm your email.</span> A link went to {email}. Invitations you send from Daythread wait until it&rsquo;s confirmed.
        {note && <span className="block text-ink/60">{note}</span>}
      </span>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await resendVerification();
            setNote(r.status === "sent" ? "Sent again. Check spam if it doesn't arrive." : r.status === "throttled" ? "A few links have gone out already. Try again in an hour." : r.status === "already_verified" ? "Already confirmed. Reload the page." : "Email isn't configured on this deployment yet.");
          })
        }
        className="shrink-0 text-ink font-medium hover:underline disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/70 rounded"
      >
        {pending ? "Sending…" : "Resend"}
      </button>
    </div>
  );
}
