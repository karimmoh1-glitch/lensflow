"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { signup } from "@/app/actions/auth";
import { Button, Input, Field, FormError } from "@/components/ui";
import { PasswordInput } from "@/components/PasswordInput";
import { AuthShell } from "@/components/auth/AuthShell";

/** Signup is a person, not a company: a name, an email, a password. The inbox is theirs. */
export default function SignupPage() {
  const [error, setError] = useState<string | null>(null);
  const [duplicateEmail, setDuplicateEmail] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    window.dispatchEvent(new CustomEvent("dt-auth", { detail: 3 }));
    setDuplicateEmail(false);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await signup(formData);
      if (result?.error) {
        setError(result.error);
        setDuplicateEmail(!!result.duplicateEmail);
        window.dispatchEvent(new CustomEvent("dt-auth", { detail: 0 }));
      }
    });
  }

  return (
    <AuthShell
      eyebrow="Start free"
      title="One inbox for every message."
      lede="Free to start, no card. Connect Gmail, Instagram, WhatsApp or a text number in a minute."
      footer={
        <>
          Already on Daythread?{" "}
          <Link href="/login" className="font-semibold text-ink hover:text-accent-text transition-colors">
            Log in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <Field id="name" label="Your name">
          <Input id="name" name="name" autoComplete="name" placeholder="Alex Rivera" required maxLength={80} />
        </Field>
        <Field id="email" label="Email" error={duplicateEmail ? error : null}>
          <Input id="email" name="email" type="email" autoComplete="email" inputMode="email" placeholder="you@example.com" required onInput={() => window.dispatchEvent(new CustomEvent("dt-auth", { detail: 1 }))} aria-invalid={duplicateEmail} />
        </Field>
        {duplicateEmail && (
          <p className="-mt-2 text-xs text-ink/60 flex gap-3">
            <Link href="/login" className="font-semibold text-ink hover:text-accent-text">Log in instead</Link>
            <Link href="/forgot-password" className="font-semibold text-ink hover:text-accent-text">Forgot the password?</Link>
          </p>
        )}
        <Field id="password" label="Password" hint="At least 8 characters.">
          <PasswordInput id="password" name="password" autoComplete="new-password" required onInput={() => window.dispatchEvent(new CustomEvent("dt-auth", { detail: 2 }))} minLength={8} />
        </Field>
        {error && !duplicateEmail && <FormError>{error}</FormError>}
        <Button type="submit" size="lg" className="w-full mt-2" loading={pending} loadingLabel="Creating your inbox">
          Create my inbox
        </Button>
        <p className="text-xs text-ink/45 text-center">By continuing you agree to the <Link href="/terms" className="underline">terms</Link> and <Link href="/privacy" className="underline">privacy policy</Link>.</p>
      </form>
    </AuthShell>
  );
}
