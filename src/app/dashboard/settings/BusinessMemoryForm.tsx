"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Textarea } from "@/components/ui";
import { OptionGrid } from "@/components/onboarding/OptionGrid";
import { useToast } from "@/components/Toaster";
import { updateBusinessMemory } from "@/app/actions/settings";
import { TONE_LABEL, type BusinessMemory } from "@/lib/businessMemory";

/**
 * "How Daythread should understand your business." The owner writes it; drafts and the
 * assistant may quote it and must not contradict it. Nothing here is ever written by the
 * model, and a draft that needs a fact not written here asks for it instead of inventing it.
 */
export function BusinessMemoryForm({ initial }: { initial: BusinessMemory }) {
  const [m, setM] = useState<BusinessMemory>(initial);
  const [pending, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();
  const dirty = JSON.stringify(m) !== JSON.stringify(initial);
  const save = () => start(async () => {
    const r = await updateBusinessMemory(m);
    if (r.error) { toast({ tone: "signal", title: "Couldn't save", body: r.error }); return; }
    toast({ tone: "outcome", title: "Saved", body: "Drafts and the assistant will use these notes from now on." });
    router.refresh();
  });
  const T = (k: keyof Omit<BusinessMemory, "tone">, label: string, hint: string, rows = 2, max = 600) => (
    <Field id={`memory-${k}`} label={label} hint={hint}>
      <Textarea id={`memory-${k}`} rows={rows} maxLength={max} value={m[k]} onChange={(e) => setM({ ...m, [k]: e.target.value })} />
    </Field>
  );
  return (
    <section aria-labelledby="memory-title" className="rounded-[22px] border border-border bg-white px-5 py-5">
      <h2 id="memory-title" className="text-[15px] font-extrabold text-ink">How Daythread should understand your business</h2>
      <p className="mt-1 text-sm text-ink/65 leading-relaxed">In your words. Drafts and the assistant treat these as facts they may quote and must not contradict; anything not written here they ask about rather than invent. Nothing on this page is ever written by the model.</p>
      <div className="mt-5 space-y-5">
        <fieldset>
          <legend className="text-[13px] font-semibold text-ink/80 mb-2">Tone of voice</legend>
          <OptionGrid label="Tone of voice" options={(Object.keys(TONE_LABEL) as BusinessMemory["tone"][]).map((k) => [k, TONE_LABEL[k]] as const)} value={m.tone} onChange={(k) => setM({ ...m, tone: k })} columns={3} size="sm" />
        </fieldset>
        {T("about", "What you do", "One or two sentences a customer would understand.", 2, 600)}
        {T("locations", "Areas you serve", "Cities, a radius, on-location or studio.", 1, 300)}
        {T("booking", "How booking works", "Deposit, what confirms a date, how far ahead people should book.", 2, 600)}
        {T("policies", "Policies", "Cancellations, rescheduling, weather, turnaround.", 2, 800)}
        {T("faqs", "Common questions and your answers", "Paste the questions you answer every week, with the answer you give.", 4, 1500)}
      </div>
      <div className="mt-5 flex items-center gap-3">
        <Button onClick={save} disabled={!dirty} loading={pending} loadingLabel="Saving">Save</Button>
        <p className="text-xs text-ink/65">Services and prices come from the Services list above; no need to repeat them here.</p>
      </div>
    </section>
  );
}
