"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input, Select } from "@/components/ui";
import { useToast } from "@/components/Toaster";
import { updateProfile } from "@/app/actions/settings";

const ZONES = (() => {
  try {
    return (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? [];
  } catch {
    return [];
  }
})();

/** Your name, what this inbox is called, and the timezone message times are shown in. */
export function ProfileForm({ name, email, workspaceName, timezone }: { name: string; email: string; workspaceName: string; timezone: string }) {
  const [form, setForm] = useState({ name, workspaceName, timezone });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();
  const zones = ZONES.length ? (ZONES.includes(timezone) ? ZONES : [timezone, ...ZONES]) : [timezone];
  const dirty = form.name !== name || form.workspaceName !== workspaceName || form.timezone !== timezone;

  return (
    <form
      className="rounded-[22px] border border-border bg-white px-5 py-5 space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const r = await updateProfile(form);
          if (r.error) return setError(r.error);
          toast({ tone: "outcome", title: "Profile saved" });
          router.refresh();
        });
      }}
    >
      <div>
        <h2 className="text-sm font-semibold text-ink">Profile</h2>
        <p className="mt-0.5 text-xs text-ink/70">Signed in as {email}.</p>
      </div>
      <Field id="profile-name" label="Your name">
        <Input id="profile-name" value={form.name} autoComplete="name" onChange={(e) => setForm({ ...form, name: e.target.value })} required maxLength={80} />
      </Field>
      <Field id="profile-workspace" label="Inbox name" hint="What teammates see when they join, and the name on invitations.">
        <Input id="profile-workspace" value={form.workspaceName} onChange={(e) => setForm({ ...form, workspaceName: e.target.value })} required maxLength={80} />
      </Field>
      <Field id="profile-tz" label="Timezone" hint="Message times are shown in this zone.">
        <Select id="profile-tz" value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })}>
          {zones.map((z) => <option key={z} value={z}>{z.replace(/_/g, " ")}</option>)}
        </Select>
      </Field>
      {error && <p role="alert" className="text-xs text-danger-text">{error}</p>}
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={!dirty} loading={pending} loadingLabel="Saving">Save</Button>
        {dirty && !pending && <button type="button" className="text-xs text-ink/65 hover:text-ink" onClick={() => setForm({ name, workspaceName, timezone })}>Reset</button>}
      </div>
    </form>
  );
}
