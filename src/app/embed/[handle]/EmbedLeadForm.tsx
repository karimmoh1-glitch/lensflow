"use client";

import { useState, useTransition } from "react";
import { Button, Input, Label, Select, Textarea } from "@/components/ui";
import { submitWebsiteLead } from "@/app/actions/websiteLead";
import { CheckCircle2 } from "lucide-react";

export function EmbedLeadForm({ handle, services }: { handle: string; services: { id: string; name: string }[] }) {
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await submitWebsiteLead(handle, {
        name: String(form.get("name") || ""),
        email: String(form.get("email") || ""),
        phone: String(form.get("phone") || ""),
        serviceId: String(form.get("serviceId") || "") || undefined,
        preferredDate: String(form.get("preferredDate") || "") || undefined,
        message: String(form.get("message") || ""),
      });
      if (!result.ok) setError(result.error);
      else setDone(true);
    });
  }

  if (done) {
    return (
      <div className="flex flex-col items-center text-center py-10">
        <CheckCircle2 className="w-8 h-8 text-success mb-3" strokeWidth={1.75} />
        <p className="text-sm font-medium text-ink">Thanks — your message is on its way.</p>
        <p className="text-xs text-ink/50 mt-1">We'll be in touch soon.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3.5">
      <div>
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" required />
      </div>
      <div>
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required />
      </div>
      <div>
        <Label htmlFor="phone">Phone (optional)</Label>
        <Input id="phone" name="phone" type="tel" />
      </div>
      {services.length > 0 && (
        <div>
          <Label htmlFor="serviceId">Service</Label>
          <Select id="serviceId" name="serviceId" defaultValue="">
            <option value="">Not sure yet</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </div>
      )}
      <div>
        <Label htmlFor="preferredDate">Preferred date (optional)</Label>
        <Input id="preferredDate" name="preferredDate" type="date" />
      </div>
      <div>
        <Label htmlFor="message">Message</Label>
        <Textarea id="message" name="message" rows={3} required placeholder="Tell us about your shoot…" />
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Sending…" : "Send message"}
      </Button>
    </form>
  );
}
