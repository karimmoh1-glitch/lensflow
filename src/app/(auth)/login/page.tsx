"use client";

import { Suspense, useState, useTransition } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { login } from "@/app/actions/auth";
import { Button, Input, Label, Card, CardBody } from "@/components/ui";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const searchParams = useSearchParams();
  const justReset = searchParams.get("reset") === "1";

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await login(formData);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <main className="relative min-h-screen bg-paper flex items-center justify-center px-6 overflow-hidden">
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[560px] h-[420px] rounded-full opacity-[0.16] blur-3xl pointer-events-none"
        style={{ background: "radial-gradient(ellipse, #F0524D 0%, transparent 72%)" }}
        aria-hidden
      />
      <Card className="relative w-full max-w-sm">
        <CardBody className="p-8">
          <Link href="/" className="font-display text-lg">
            Daythread
          </Link>
          <h1 className="font-sans font-black text-2xl tracking-tight mt-4 mb-6">Welcome back</h1>

          {justReset && (
            <p className="mb-4 text-sm text-success bg-success/10 rounded-md px-3 py-2">
              Your password has been reset. Log in with your new password.
            </p>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" placeholder="alex@business.com" required />
            </div>
            <div>
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <Link href="/forgot-password" className="text-xs text-accent-text font-medium">
                  Forgot password?
                </Link>
              </div>
              <Input id="password" name="password" type="password" required />
            </div>
            {error && <p className="text-sm text-danger">{error}</p>}
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "Logging in…" : "Log in"}
            </Button>
          </form>

          <p className="mt-6 text-sm text-center text-ink/70">
            Don&apos;t have an account?{" "}
            <Link href="/signup" className="text-accent-text font-medium">
              Start free
            </Link>
          </p>
        </CardBody>
      </Card>
    </main>
  );
}
