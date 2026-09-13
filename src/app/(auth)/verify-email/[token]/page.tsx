"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { verifyEmail } from "@/app/actions/auth";
import { Button, FormError } from "@/components/ui";
import { AuthShell } from "@/components/auth/AuthShell";

/**
 * The link from the verification email lands here, on a button rather than a bare GET:
 * mail scanners and link previews open links, and an address must only be proven by the
 * person who holds the inbox pressing confirm.
 */
export default function VerifyEmailPage({ params }: { params: { token: string } }) {
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();

  function confirm() {
    setError(null);
    start(async () => {
      const r = await verifyEmail(params.token);
      if ("error" in r) {
        setError(r.error);
        return;
      }
      setDone(true);
      setTimeout(() => router.push(r.next), 900);
    });
  }

  if (done) {
    return (
      <AuthShell eyebrow="Confirmed" title="Your email address is confirmed." lede="Taking you back to Daythread.">
        <Link href="/dashboard" className="text-sm font-semibold text-ink hover:text-accent-text transition-colors">
          Open Daythread →
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell eyebrow="One click" title="Confirm your email address." lede="This proves the address is yours. The link works once and expires after a day.">
      <div className="space-y-4">
        {error && (
          <FormError
            action={
              <Link href="/dashboard" className="text-ink hover:text-accent-text">
                Request a new link from Daythread
              </Link>
            }
          >
            {error}
          </FormError>
        )}
        <Button size="lg" className="w-full" onClick={confirm} loading={pending} loadingLabel="Confirming">
          Confirm my email
        </Button>
      </div>
    </AuthShell>
  );
}
