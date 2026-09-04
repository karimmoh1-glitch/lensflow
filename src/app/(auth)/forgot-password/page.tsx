"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { forgotPassword } from "@/app/actions/auth";
import { Button, Input, Field, FormError } from "@/components/ui";
import { AuthShell } from "@/components/auth/AuthShell";

export default function ForgotPasswordPage() {
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [devLink, setDevLink] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await forgotPassword(formData);
      if (result.error) {
        setError(result.error);
      } else {
        setSent(true);
        setDevLink(result.devLink ?? null);
      }
    });
  }

  const footer = (
    <Link href="/login" className="font-semibold text-ink hover:text-accent-text transition-colors">
      ← Back to log in
    </Link>
  );

  if (sent) {
    return (
      <AuthShell eyebrow="Check your email" title="If that address is yours, a link is on its way." lede="It works for one hour. Nothing in your inbox? Check spam, then try again." footer={footer}>
        {devLink && (
          <div className="rounded-xl border border-warning/30 bg-warning-soft px-3.5 py-3 dt-swap">
            <p className="text-xs font-semibold text-warning-text mb-1.5">No email provider is configured on this deployment, so here&rsquo;s the link directly:</p>
            <a href={devLink} className="text-xs text-accent-text underline break-all">
              {devLink}
            </a>
          </div>
        )}
      </AuthShell>
    );
  }

  return (
    <AuthShell eyebrow="Reset" title="Forgot your password?" lede="Enter your email and we'll send a link to choose a new one." footer={footer}>
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <Field id="email" label="Email">
          <Input id="email" name="email" type="email" autoComplete="email" inputMode="email" placeholder="you@yourbusiness.com" required aria-invalid={!!error} />
        </Field>
        {error && <FormError>{error}</FormError>}
        <Button type="submit" size="lg" className="w-full mt-2" loading={pending} loadingLabel="Sending">
          Send the link
        </Button>
      </form>
    </AuthShell>
  );
}
