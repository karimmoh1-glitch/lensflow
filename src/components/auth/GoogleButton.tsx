"use client";

import { useTransition } from "react";
import { startGoogleSignIn } from "@/app/actions/googleSignIn";
import { cn } from "@/lib/utils";

/**
 * "Continue with Google" for the login and signup pages. Rendered only when the server says
 * the Google OAuth client is configured, so it never promises a sign-in that can't happen.
 */
export function GoogleButton({ intent, className, personalization, divider = "or with email" }: { intent: "login" | "signup"; className?: string; personalization?: { answers: string; selectedPlan?: string; anonymousId?: string }; divider?: string | null }) {
  const [pending, startTransition] = useTransition();
  return (
    <div className={cn("space-y-4", className)}>
      <button
        type="button"
        onClick={() => startTransition(() => startGoogleSignIn(intent, personalization))}
        disabled={pending}
        className="w-full inline-flex items-center justify-center gap-2.5 h-12 rounded-full border border-border bg-white text-[15px] font-semibold text-ink hover:bg-black/[0.03] active:scale-[0.99] transition-[background-color,transform] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
        aria-busy={pending}
      >
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
          <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.5 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.3l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
          <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.6 5.9c4.4-4.1 7-10.1 7-17.6z" />
          <path fill="#FBBC05" d="M10.5 28.6A14.5 14.5 0 0 1 9.7 24c0-1.6.3-3.1.8-4.6l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.7l7.9-6.1z" />
          <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.3 0-11.6-4.1-13.5-9.9l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
        </svg>
        {pending ? "Opening Google…" : "Continue with Google"}
      </button>
      {divider && (
        <div className="flex items-center gap-3 text-[11px] font-bold uppercase tracking-[0.14em] text-ink/65" aria-hidden>
          <span className="h-px flex-1 bg-border" />
          {divider}
          <span className="h-px flex-1 bg-border" />
        </div>
      )}
    </div>
  );
}
