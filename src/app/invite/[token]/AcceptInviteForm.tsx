"use client";

import { useState, useTransition } from "react";
import { acceptInvitation } from "@/app/actions/invitations";
import { Button, Input, Field, FormError } from "@/components/ui";
import { PasswordInput } from "@/components/PasswordInput";

export function AcceptInviteForm({ token, email, existingAccount }: { token: string; email: string; existingAccount: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await acceptInvitation(token, formData);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <Field id="email" label="Email" hint="The invitation was sent here.">
        <Input id="email" value={email} disabled readOnly />
      </Field>
      {!existingAccount && (
        <Field id="name" label="Your name">
          <Input id="name" name="name" autoComplete="name" required />
        </Field>
      )}
      <Field
        id="password"
        label={existingAccount ? "Password" : "Create a password"}
        hint={existingAccount ? "You already have a Daythread account with this email — enter its password to accept." : "At least 8 characters."}
      >
        <PasswordInput id="password" name="password" autoComplete={existingAccount ? "current-password" : "new-password"} required minLength={existingAccount ? undefined : 8} aria-invalid={!!error} />
      </Field>
      {error && <FormError>{error}</FormError>}
      <Button type="submit" size="lg" className="w-full mt-2" loading={pending} loadingLabel="Joining">
        {existingAccount ? "Accept invitation" : "Create account and join"}
      </Button>
    </form>
  );
}
