"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { forgotPassword } from "@/app/actions/auth";
import { Button, Input, Label, Card, CardBody } from "@/components/ui";

export default function ForgotPasswordPage() {
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
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
      }
    });
  }

  return (
    <main className="min-h-screen bg-paper flex items-center justify-center px-6">
      <Card className="w-full max-w-sm">
        <CardBody className="p-8">
          <Link href="/" className="font-display text-lg">
            LensFlow
          </Link>
          <h1 className="font-display text-2xl mt-4 mb-1">Reset your password</h1>

          {sent ? (
            <>
              <p className="text-sm text-ink/60 mt-4">
                If an account exists for that email, we&apos;ve sent a link to reset your password. It expires in 1 hour.
              </p>
              <p className="mt-6 text-sm text-center text-ink/50">
                <Link href="/login" className="text-accent-text font-medium">
                  Back to log in
                </Link>
              </p>
            </>
          ) : (
            <>
              <p className="text-sm text-ink/50 mb-6">Enter your email and we&apos;ll send you a reset link.</p>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" name="email" type="email" placeholder="alex@studio.com" required />
                </div>
                {error && <p className="text-sm text-danger">{error}</p>}
                <Button type="submit" className="w-full" disabled={pending}>
                  {pending ? "Sending…" : "Send reset link"}
                </Button>
              </form>
              <p className="mt-6 text-sm text-center text-ink/50">
                <Link href="/login" className="text-accent-text font-medium">
                  Back to log in
                </Link>
              </p>
            </>
          )}
        </CardBody>
      </Card>
    </main>
  );
}
