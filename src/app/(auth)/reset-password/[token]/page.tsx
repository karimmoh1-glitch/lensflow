"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { resetPassword } from "@/app/actions/auth";
import { Button, Field, FormError } from "@/components/ui";
import { PasswordInput } from "@/components/PasswordInput";
import { AuthShell } from "@/components/auth/AuthShell";

export default function ResetPasswordPage({ params }: { params: { token: string } }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await resetPassword(params.token, formData);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <AuthShell eyebrow="Reset" title="Choose a new password." lede="You'll use it from now on, on every device.">
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <Field id="password" label="New password" hint="At least 8 characters.">
          <PasswordInput id="password" name="password" autoComplete="new-password" required minLength={8} aria-invalid={!!error} />
        </Field>
        {error && (
          <FormError
            action={
              <Link href="/forgot-password" className="text-ink hover:text-accent-text">
                Request a new link
              </Link>
            }
          >
            {error}
          </FormError>
        )}
        <Button type="submit" size="lg" className="w-full mt-2" loading={pending} loadingLabel="Saving">
          Save password
        </Button>
      </form>
    </AuthShell>
  );
}
