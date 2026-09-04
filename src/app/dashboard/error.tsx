"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui";

/**
 * The app's error boundary. Nothing technical reaches the customer: no stack, no message
 * from the exception (Next strips it in production anyway). What they get is what happened
 * in plain words, the reassurance that their data is where they left it, and two ways out.
 */
export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Keep the detail where it belongs — the console, for whoever is debugging.
    console.error(error);
  }, [error]);

  return (
    <div className="max-w-md mx-auto px-6 py-24 text-center dt-swap">
      <div aria-hidden className="flex flex-col items-center mb-6">
        <span className="w-px h-8 bg-ink/10" />
        <span className="w-[13px] h-[13px] rounded-full bg-accent ring-[3px] ring-paper" />
        <span className="w-px h-8 bg-gradient-to-b from-ink/10 to-transparent" />
      </div>
      <h1 className="font-sans font-extrabold text-2xl tracking-tight text-ink">This page didn&rsquo;t load.</h1>
      <p className="mt-2 text-sm text-ink/60 leading-relaxed">
        Something on our side broke while opening it. Your messages, bookings and payments are untouched. Try once more, or head home.
      </p>
      <div className="mt-6 flex items-center justify-center gap-3">
        <Button onClick={reset}>Try again</Button>
        <Link href="/dashboard" className="text-sm font-semibold text-ink/60 hover:text-ink transition-colors">
          Go home
        </Link>
      </div>
      {error.digest && <p className="mt-8 text-[11px] text-ink/35 tabular-nums">Reference {error.digest}</p>}
    </div>
  );
}
