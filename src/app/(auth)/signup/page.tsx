"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { signup } from "@/app/actions/auth";
import { Button, Input, Label, Card, CardBody } from "@/components/ui";

export default function SignupPage() {
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
    <main className="min-h-screen bg-paper flex items-center justify-center px-6 py-12">
      <Card className="w-full max-w-sm">
        <CardBody className="p-8">
          <Link href="/" className="font-display text-lg">
            LensFlow
          </Link>
          <h1 className="font-display text-2xl mt-4 mb-1">Start running your business in one place.</h1>
          <p className="text-sm text-ink/50 mb-6">Free to start. No credit card required.</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="name">Full name</Label>
              <Input id="name" name="name" placeholder="Alex Rivera" required />
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" placeholder="alex@studio.com" required />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input id="password" name="password" type="password" placeholder="At least 8 characters" required />
            </div>
            <div>
              <Label htmlFor="businessName">Business / Studio name</Label>
              <Input id="businessName" name="businessName" placeholder="Rivera Photography" required />
            </div>
            <div>
              <Label htmlFor="businessType">Business type (optional)</Label>
              <Input id="businessType" name="businessType" placeholder="Wedding photography" />
            </div>
            <div>
              <Label htmlFor="phone">Phone number (optional)</Label>
              <Input id="phone" name="phone" type="tel" placeholder="(555) 123-4567" />
            </div>

            {error && (
              <div className="text-sm text-danger space-y-1">
                <p>{error}</p>
                {duplicateEmail && (
                  <p className="flex gap-3">
                    <Link href="/login" className="text-accent-text font-medium">
                      Log in
                    </Link>
                    <Link href="/forgot-password" className="text-accent-text font-medium">
                      Forgot password?
                    </Link>
                  </p>
                )}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "Creating workspace…" : "Create my workspace"}
            </Button>
          </form>

          <p className="mt-6 text-sm text-center text-ink/50">
            Already have an account?{" "}
            <Link href="/login" className="text-accent-text font-medium">
              Log in
            </Link>
          </p>
        </CardBody>
      </Card>
    </main>
  );
}
