"use client";

import { useEffect } from "react";
import Link from "next/link";
import { LogoMark } from "@/components/Logo";
import { Button } from "@/components/ui";

/** Root error boundary for everything outside the app shell (marketing, auth, portals). */
export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="min-h-screen bg-paper flex items-center justify-center px-6">
      <div className="max-w-md text-center dt-swap">
        <LogoMark className="w-7 h-7 mx-auto mb-6 text-ink" />
        <h1 className="font-sans font-extrabold text-2xl tracking-tight text-ink">That didn&rsquo;t work.</h1>
        <p className="mt-2 text-sm text-ink/60 leading-relaxed">Something broke on our side while loading this page. Nothing of yours was lost. Try again, or go back to the start.</p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <Button onClick={reset}>Try again</Button>
          <Link href="/" className="text-sm font-semibold text-ink/60 hover:text-ink transition-colors">
            Home
          </Link>
        </div>
        {error.digest && <p className="mt-8 text-[11px] text-ink/35 tabular-nums">Reference {error.digest}</p>}
      </div>
    </main>
  );
}
