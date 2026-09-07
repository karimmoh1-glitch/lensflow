"use client";

import { Suspense, useState, useTransition } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { login } from "@/app/actions/auth";
import { Button, Input, Field, FormError } from "@/components/ui";
import { PasswordInput } from "@/components/PasswordInput";
import { AuthShell } from "@/components/auth/AuthShell";
import { GoogleButton } from "@/components/auth/GoogleButton";
import { GOOGLE_SIGN_IN_MESSAGES } from "@/lib/googleSignInMessages";

export function LoginForm({ google }: { google: boolean }) {
  return (
    <Suspense>
      <LoginFormInner google={google} />
    </Suspense>
  );
}

function LoginFormInner({ google }: { google: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const searchParams = useSearchParams();
  const justReset = searchParams.get("reset") === "1";
  const googleError = searchParams.get("google");
  const googleMessage = googleError ? ((GOOGLE_SIGN_IN_MESSAGES as Record<string, string>)[googleError] ?? GOOGLE_SIGN_IN_MESSAGES.provider) : null;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    window.dispatchEvent(new CustomEvent("dt-auth", { detail: 3 }));
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await login(formData);
      if (result?.error) {
        setError(result.error);
        window.dispatchEvent(new CustomEvent("dt-auth", { detail: 0 }));
      }
    });
  }

  return (
    <AuthShell
      eyebrow="Log in"
      title="Pick up your thread."
      footer={
        <>
          New here?{" "}
          <Link href="/start" className="font-semibold text-ink hover:text-accent-text transition-colors">
            Start free
          </Link>
        </>
      }
    >
      {justReset && (
        <p role="status" className="mb-5 rounded-xl border border-success/25 bg-success-soft/60 px-3.5 py-3 text-sm text-success-text dt-swap">
          Password changed. Log in with the new one.
        </p>
      )}
      {googleMessage && <p role="alert" className="mb-5 rounded-xl border border-warning/30 bg-warning-soft/60 px-3.5 py-3 text-sm text-warning-text dt-swap">{googleMessage}</p>}
      {google && <GoogleButton intent="login" className="mb-5" />}
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <Field id="email" label="Email">
          <Input id="email" name="email" type="email" autoComplete="email" inputMode="email" placeholder="you@yourbusiness.com" required onInput={() => window.dispatchEvent(new CustomEvent("dt-auth", { detail: 1 }))} aria-invalid={!!error} />
        </Field>
        <Field
          id="password"
          label="Password"
          trailing={
            <Link href="/forgot-password" className="text-xs font-semibold text-ink/65 hover:text-ink transition-colors">
              Forgot it?
            </Link>
          }
        >
          <PasswordInput id="password" name="password" autoComplete="current-password" required onInput={() => window.dispatchEvent(new CustomEvent("dt-auth", { detail: 2 }))} aria-invalid={!!error} />
        </Field>
        {error && <FormError>{error}</FormError>}
        <Button type="submit" size="lg" className="w-full mt-2" loading={pending} loadingLabel="Opening your thread">
          Log in
        </Button>
      </form>
    </AuthShell>
  );
}
