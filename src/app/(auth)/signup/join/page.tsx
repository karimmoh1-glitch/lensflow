"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { searchBusinesses, requestToJoin } from "@/app/actions/joinRequests";
import { Button, Input, Label, Card, CardBody } from "@/components/ui";

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

  if (submitted) {
    return (
      <main className="min-h-screen bg-paper flex items-center justify-center px-6 py-12">
        <Card className="w-full max-w-sm">
          <CardBody className="p-8 text-center">
            <h1 className="font-display text-xl mb-2">Request sent</h1>
            <p className="text-sm text-ink/50 mb-6">
              {selected?.name} needs to approve your request before you can sign in. You'll be able to log in as soon as they accept it.
            </p>
            <Link href="/login">
              <Button className="w-full">Go to login</Button>
            </Link>
          </CardBody>
        </Card>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-paper flex items-center justify-center px-6 py-12">
      <Card className="w-full max-w-sm">
        <CardBody className="p-8">
          <Link href="/signup" className="text-xs text-ink/40 hover:text-ink/60 mb-4 inline-block">
            ← Back
          </Link>
          <Link href="/" className="font-display text-lg block">
            Daythread
          </Link>

          {!selected ? (
            <>
              <h1 className="font-display text-2xl mt-4 mb-1">Find your business</h1>
              <p className="text-sm text-ink/50 mb-6">Businesses are private — search by name to find the one you work with.</p>

              <form onSubmit={handleSearch} className="space-y-3">
                <div>
                  <Label htmlFor="query">Business name</Label>
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
                </div>
                <Button type="submit" className="w-full" disabled={searching || query.trim().length < 2}>
                  {searching ? "Searching…" : "Search"}
                </Button>
              </form>

              {results.length > 0 && (
                <div className="mt-4 space-y-2">
                  {results.map((b) => (
                    <button
                      key={b.id}
                      onClick={() => setSelected(b)}
                      className="w-full text-left px-3.5 py-3 rounded-md border border-border hover:bg-black/[0.02] transition-colors"
                    >
                      <div className="text-sm font-medium">{b.name}</div>
                      {b.businessType && <div className="text-xs text-ink/45">{b.businessType}</div>}
                    </button>
                  ))}
                </div>
              )}
              {!searching && hasSearched && results.length === 0 && (
                <p className="mt-4 text-sm text-ink/45">No business found with that name. Double-check the spelling with them.</p>
              )}
            </>
          ) : (
            <>
              <h1 className="font-display text-2xl mt-4 mb-1">Request to join</h1>
              <p className="text-sm text-ink/50 mb-6">
                You're requesting to join <span className="font-medium text-ink">{selected.name}</span>. They'll need to approve you
                before you get access.
              </p>

              <form onSubmit={handleRequest} className="space-y-4">
                <div>
                  <Label htmlFor="name">Full name</Label>
                  <Input id="name" name="name" placeholder="Sarah Johnson" required />
                </div>
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" name="email" type="email" placeholder="you@example.com" required />
                </div>
                <div>
                  <Label htmlFor="password">Password</Label>
                  <Input id="password" name="password" type="password" placeholder="At least 8 characters" required />
                </div>
                <p className="text-xs text-ink/40">Already have a Daythread account? Enter its email and password instead.</p>

                {error && <p className="text-sm text-danger">{error}</p>}

                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={() => setSelected(null)}>
                    Back
                  </Button>
                  <Button type="submit" className="flex-1" disabled={pending}>
                    {pending ? "Sending…" : "Send request"}
                  </Button>
                </div>
              </form>
            </>
          )}

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
