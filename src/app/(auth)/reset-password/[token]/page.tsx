"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { resetPassword } from "@/app/actions/auth";
import { Button, Input, Label, Card, CardBody } from "@/components/ui";

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
    <main className="min-h-screen bg-paper flex items-center justify-center px-6">
      <Card className="w-full max-w-sm">
        <CardBody className="p-8">
          <Link href="/" className="font-display text-lg">
            Daythread
          </Link>
          <h1 className="font-display text-2xl mt-4 mb-1">Choose a new password</h1>
          <p className="text-sm text-ink/50 mb-6">Enter a new password for your account.</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="password">New password</Label>
              <Input id="password" name="password" type="password" placeholder="At least 8 characters" required />
            </div>
            {error && (
              <div className="text-sm text-danger space-y-1">
                <p>{error}</p>
                <Link href="/forgot-password" className="text-accent-text font-medium">
                  Request a new link
                </Link>
              </div>
            )}
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "Saving…" : "Reset password"}
            </Button>
          </form>
        </CardBody>
      </Card>
    </main>
  );
}
