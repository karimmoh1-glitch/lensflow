"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { searchBusinesses, requestToJoin } from "@/app/actions/joinRequests";
import { Button, Input, Field, FormError } from "@/components/ui";
import { PasswordInput } from "@/components/PasswordInput";
import { AuthShell } from "@/components/auth/AuthShell";
import { initials } from "@/lib/utils";

type BusinessResult = { id: string; name: string; handle: string; businessType: string | null };

export default function JoinBusinessSignupPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<BusinessResult[]>([]);
  const [searching, startSearch] = useTransition();
  const [selected, setSelected] = useState<BusinessResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [pending, startTransition] = useTransition();
  const [hasSearched, setHasSearched] = useState(false);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startSearch(async () => {
      const found = await searchBusinesses(query);
      setResults(found);
      setHasSearched(true);
    });
  }

  function handleRequest(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected) return;
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await requestToJoin(selected.id, formData);
      if (result.error) setError(result.error);
      else setSubmitted(true);
    });
  }

  const footer = (
    <>
      Already on Daythread?{" "}
      <Link href="/login" className="font-semibold text-ink hover:text-accent-text transition-colors">
        Log in
      </Link>
    </>
  );

  if (submitted) {
    return (
      <AuthShell eyebrow="Request sent" title={`${selected?.name} will let you in.`} lede="They approve requests from their team page. The moment they do, your login works.">
        <Link href="/login" className="inline-flex">
          <Button size="lg">Go to log in</Button>
        </Link>
      </AuthShell>
    );
  }

  if (!selected) {
    return (
      <AuthShell back={{ href: "/signup", label: "Back" }} eyebrow="Join a team" title="Find the business." lede="Businesses are private. Search by name to find the one you work with." footer={footer}>
        <form onSubmit={handleSearch} className="space-y-4" noValidate>
          <Field id="query" label="Business name">
            <Input
              id="query"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setHasSearched(false);
              }}
              placeholder="Rivera Consulting"
              autoFocus
            />
          </Field>
          <Button type="submit" size="lg" className="w-full" loading={searching} loadingLabel="Searching" disabled={query.trim().length < 2}>
            Search
          </Button>
        </form>
        {results.length > 0 && (
          <ul className="mt-5 space-y-2 dt-swap">
            {results.map((b) => (
              <li key={b.id}>
                <button
                  type="button"
                  onClick={() => setSelected(b)}
                  className="w-full flex items-center gap-3 text-left px-4 py-3 rounded-2xl border border-border bg-white hover:border-ink/25 hover:-translate-y-px transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
                >
                  <span className="w-9 h-9 rounded-full bg-accent-soft text-accent-text flex items-center justify-center text-xs font-extrabold shrink-0">{initials(b.name)}</span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-ink truncate">{b.name}</span>
                    {b.businessType && <span className="block text-xs text-ink/55 truncate">{b.businessType}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {!searching && hasSearched && results.length === 0 && (
          <p className="mt-4 text-sm text-ink/60">Nothing by that name. Check the spelling with them — it has to match exactly.</p>
        )}
      </AuthShell>
    );
  }

  return (
    <AuthShell
      back={{ href: "/signup/join", label: "Different business" }}
      eyebrow="Join a team"
      title={`Ask to join ${selected.name}.`}
      lede="They'll approve you before you get access."
      footer={footer}
    >
      <form onSubmit={handleRequest} className="space-y-4" noValidate>
        <Field id="name" label="Your name">
          <Input id="name" name="name" autoComplete="name" placeholder="Sarah Johnson" required />
        </Field>
        <Field id="email" label="Email" hint="Already have a Daythread account? Use its email and password.">
          <Input id="email" name="email" type="email" autoComplete="email" inputMode="email" placeholder="you@example.com" required />
        </Field>
        <Field id="password" label="Password">
          <PasswordInput id="password" name="password" autoComplete="new-password" required minLength={8} />
        </Field>
        {error && <FormError>{error}</FormError>}
        <div className="flex gap-2 pt-1">
          <Button type="button" variant="outline" size="lg" onClick={() => setSelected(null)}>
            Back
          </Button>
          <Button type="submit" size="lg" className="flex-1" loading={pending} loadingLabel="Sending">
            Send request
          </Button>
        </div>
      </form>
    </AuthShell>
  );
}
