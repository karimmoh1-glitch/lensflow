"use client";

import { useState, useTransition } from "react";
import { acceptInvitation } from "@/app/actions/invitations";
import { Button, Input, Label } from "@/components/ui";

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
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label>Email</Label>
        <Input value={email} disabled />
      </div>

      {!existingAccount && (
        <div>
          <Label htmlFor="name">Your name</Label>
          <Input id="name" name="name" required />
        </div>
      )}

      <div>
        <Label htmlFor="password">{existingAccount ? "Password" : "Create a password"}</Label>
        <Input id="password" name="password" type="password" placeholder={existingAccount ? undefined : "At least 8 characters"} required />
      </div>

      {existingAccount && <p className="text-xs text-ink/45">An account already exists for this email — enter your password to accept.</p>}

      {error && <p className="text-sm text-danger">{error}</p>}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Joining…" : existingAccount ? "Accept invitation" : "Create account"}
      </Button>
    </form>
  );
}
