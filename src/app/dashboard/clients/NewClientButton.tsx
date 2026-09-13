"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserRoundPlus, Copy, Check } from "lucide-react";
import { Button, Input, Field, FormError } from "@/components/ui";
import { Dialog } from "@/components/Dialog";
import { createClient } from "@/app/actions/clients";

/**
 * The first client, when no channel has brought one in yet: a name and one way to reach
 * them. It creates the same Client record a message would, and opens it, so the first five
 * minutes end on a real person rather than an empty list. The booking link sits beside it
 * for the other way in — send it, and the next booking arrives filled in.
 */
export function NewClientButton({ bookingUrl, autoOpen = false, variant = "primary" }: { bookingUrl: string; autoOpen?: boolean; variant?: "primary" | "secondary" }) {
  const [open, setOpen] = useState(autoOpen);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();

  useEffect(() => {
    if (autoOpen) setOpen(true);
  }, [autoOpen]);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const f = new FormData(e.currentTarget);
    start(async () => {
      const r = await createClient({ name: String(f.get("name") ?? ""), email: String(f.get("email") ?? ""), phone: String(f.get("phone") ?? "") });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setOpen(false);
      router.push(`/dashboard/clients/${r.id}`);
    });
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(bookingUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  }

  return (
    <>
      <Button size="sm" variant={variant} onClick={() => setOpen(true)}>
        <UserRoundPlus className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden />
        Add a client
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Add a client" description="A name and one way to reach them. Their conversations and bookings gather here.">
        <form onSubmit={submit} className="space-y-3" noValidate>
          <Field id="nc-name" label="Name">
            <Input id="nc-name" name="name" autoComplete="off" placeholder="Maya Chen" required maxLength={80} data-autofocus />
          </Field>
          <Field id="nc-email" label="Email">
            <Input id="nc-email" name="email" type="email" inputMode="email" autoComplete="off" placeholder="maya@example.com" maxLength={254} />
          </Field>
          <Field id="nc-phone" label="Phone" hint="Email or phone; either is enough.">
            <Input id="nc-phone" name="phone" type="tel" inputMode="tel" autoComplete="off" placeholder="(512) 555-0148" maxLength={32} />
          </Field>
          {error && <FormError>{error}</FormError>}
          <Button type="submit" className="w-full" loading={pending} loadingLabel="Adding">
            Add client
          </Button>
        </form>
        <div className="mt-5 pt-4 border-t border-border">
          <p className="text-13 font-semibold text-ink">Or send your booking link</p>
          <p className="mt-0.5 text-13 text-ink/60">A booking made there arrives with the client, the service and the time already filled in.</p>
          <div className="mt-2 flex items-center gap-2">
            <code className="min-w-0 flex-1 rounded-lg border border-border bg-paper px-2.5 py-1.5 text-xs font-mono text-ink/80 truncate">{bookingUrl}</code>
            <Button size="sm" variant="outline" onClick={copy} aria-label="Copy booking link">
              {copied ? <Check className="w-3.5 h-3.5" strokeWidth={2.5} aria-hidden /> : <Copy className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
