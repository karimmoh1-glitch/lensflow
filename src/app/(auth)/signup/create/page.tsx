"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { signup } from "@/app/actions/auth";
import { Button, Input, Field, FormError } from "@/components/ui";
import { PasswordInput } from "@/components/PasswordInput";
import { AuthShell } from "@/components/auth/AuthShell";

export default function CreateBusinessSignupPage() {
  const [error, setError] = useState<string | null>(null);
  const [duplicateEmail, setDuplicateEmail] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setDuplicateEmail(false);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await signup(formData);
      if (result?.error) {
        setError(result.error);
        setDuplicateEmail(!!result.duplicateEmail);
      }
    });
  }

  return (
    <AuthShell
      back={{ href: "/signup", label: "Back" }}
      eyebrow="Start free"
      title="Start your thread."
      lede="Free to start, no card. You'll be the owner."
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
          <Input id="name" name="name" autoComplete="name" placeholder="Alex Rivera" required />
        </Field>
        <Field id="email" label="Email" error={duplicateEmail ? error : null}>
          <Input id="email" name="email" type="email" autoComplete="email" inputMode="email" placeholder="you@yourbusiness.com" required aria-invalid={duplicateEmail} />
        </Field>
        {duplicateEmail && (
          <p className="-mt-2 text-xs text-ink/60 flex gap-3">
            <Link href="/login" className="font-semibold text-ink hover:text-accent-text">Log in instead</Link>
            <Link href="/forgot-password" className="font-semibold text-ink hover:text-accent-text">Forgot the password?</Link>
          </p>
        )}
        <Field id="password" label="Password" hint="At least 8 characters.">
          <PasswordInput id="password" name="password" autoComplete="new-password" required minLength={8} />
        </Field>
        <Field id="businessName" label="Business name">
          <Input id="businessName" name="businessName" autoComplete="organization" placeholder="Rivera Consulting" required />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field id="businessType" label="What you do" hint="Optional">
            <Input id="businessType" name="businessType" placeholder="Design, coaching, photography…" />
          </Field>
          <Field id="phone" label="Phone" hint="Optional">
            <Input id="phone" name="phone" type="tel" autoComplete="tel" inputMode="tel" placeholder="(555) 123-4567" />
          </Field>
        </div>
        {error && !duplicateEmail && <FormError>{error}</FormError>}
        <Button type="submit" size="lg" className="w-full mt-2" loading={pending} loadingLabel="Building your Daythread">
          Build my Daythread
        </Button>
        <p className="text-xs text-ink/45 text-center">By continuing you agree to use Daythread for your own business.</p>
      </form>
    </AuthShell>
  );
}
