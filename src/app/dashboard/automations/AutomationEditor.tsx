"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Zap, Trash2, Pencil } from "lucide-react";
import { BottomSheet } from "@/components/BottomSheet";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { useToast } from "@/components/Toaster";
import { createAutomation, updateAutomation, deleteAutomation, type AutomationInput } from "@/app/actions/automations";
import { cn } from "@/lib/utils";

type Trigger = AutomationInput["trigger"];
type Action = AutomationInput["action"];

const TRIGGER_LABEL: Record<Trigger, string> = { BOOKING_CREATED: "a booking is created", DAYS_BEFORE_SHOOT: "a booking is coming up", SHOOT_COMPLETED: "a booking is completed", LEAD_INACTIVE: "a lead goes quiet" };
const ACTION_LABEL: Record<Action, string> = { SEND_CONFIRMATION: "send a confirmation", SEND_QUESTIONNAIRE: "send the questionnaire", SEND_REMINDER: "send a reminder", SEND_THANK_YOU: "send a thank-you", SEND_FOLLOW_UP: "send a follow-up" };
const TIMED: Trigger[] = ["DAYS_BEFORE_SHOOT", "SHOOT_COMPLETED", "LEAD_INACTIVE"];

/** Starting points people actually want. Each is a complete, working automation. */
const RECIPES: Array<{ key: string; label: string; input: AutomationInput }> = [
  { key: "confirm", label: "Confirm every booking", input: { name: "Booking confirmation", trigger: "BOOKING_CREATED", action: "SEND_CONFIRMATION", offsetHours: 0, messageTemplate: "Hi {{name}} — you're booked for {{service}} on {{date}} at {{time}} with {{business}}. Reply here if anything changes. See you then!" } },
  { key: "remind", label: "Remind the day before", input: { name: "Day-before reminder", trigger: "DAYS_BEFORE_SHOOT", action: "SEND_REMINDER", offsetHours: 24, messageTemplate: "Hi {{name}} — a reminder that your {{service}} is tomorrow, {{date}} at {{time}}. Reply here with any questions." } },
  { key: "thanks", label: "Thank them afterwards", input: { name: "Thank-you", trigger: "SHOOT_COMPLETED", action: "SEND_THANK_YOU", offsetHours: 24, messageTemplate: "Thank you, {{name}} — it was a pleasure. I'll be in touch as soon as everything is ready. — {{business}}" } },
  { key: "quiet", label: "Follow up when a lead goes quiet", input: { name: "Quiet-lead follow-up", trigger: "LEAD_INACTIVE", action: "SEND_FOLLOW_UP", offsetHours: 72, messageTemplate: "Hi {{name}} — just checking in from {{business}}. Happy to hold a date or answer anything. Is this still on your mind?" } },
];

const VARS = ["name", "service", "date", "time", "business"];

export function NewAutomationButton({ variant = "primary" }: { variant?: "primary" | "outline" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="md" variant={variant} onClick={() => setOpen(true)}><Plus className="w-4 h-4 mr-1" strokeWidth={2.5} aria-hidden />New automation</Button>
      <AutomationSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}

export function EditAutomationButton({ automation }: { automation: { id: string } & AutomationInput }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1 text-xs font-semibold text-ink/60 hover:text-ink px-2 py-1 rounded-md hover:bg-black/[0.05]"><Pencil className="w-3.5 h-3.5" strokeWidth={2} aria-hidden />Edit</button>
      <AutomationSheet open={open} onClose={() => setOpen(false)} existing={automation} />
    </>
  );
}

function AutomationSheet({ open, onClose, existing }: { open: boolean; onClose: () => void; existing?: { id: string } & AutomationInput }) {
  const [form, setForm] = useState<AutomationInput>(existing ?? RECIPES[0].input);
  const [recipe, setRecipe] = useState<string | null>(existing ? null : RECIPES[0].key);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();
  const timed = TIMED.includes(form.trigger);
  const set = <K extends keyof AutomationInput>(k: K, v: AutomationInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  function save() {
    setError(null);
    start(async () => {
      const r = existing ? await updateAutomation(existing.id, form) : await createAutomation(form);
      if (r.error) return setError(r.error);
      const paused = "paused" in r ? r.paused : undefined;
      if (paused) toast({ tone: "signal", title: "Saved, switched off", body: paused, ttl: 8000 });
      else toast({ tone: "thinking", title: existing ? "Automation updated" : "Automation on", body: `When ${TRIGGER_LABEL[form.trigger]}, Daythread will ${ACTION_LABEL[form.action]}.` });
      onClose();
      router.refresh();
    });
  }
  function remove() {
    if (!existing) return;
    start(async () => {
      const r = await deleteAutomation(existing.id);
      if (r.error) return setError(r.error);
      toast({ tone: "neutral", title: "Automation deleted" });
      onClose();
      router.refresh();
    });
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={existing ? "Edit automation" : "New automation"} subtitle="When this happens → Daythread does this" icon={<Zap className="w-4 h-4 text-signal-text" strokeWidth={2} aria-hidden />} size="lg">
      {!existing && (
        <div className="mb-5">
          <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink/60 mb-2">Start from</div>
          <div className="flex flex-wrap gap-1.5">
            {RECIPES.map((r) => (
              <button key={r.key} type="button" onClick={() => { setRecipe(r.key); setForm(r.input); }} className={cn("text-[13px] font-medium px-3 py-1.5 rounded-full border transition-colors", recipe === r.key ? "bg-ink text-white border-ink" : "border-border bg-white text-ink/75 hover:bg-black/[0.03]")}>{r.label}</button>
            ))}
          </div>
        </div>
      )}
      <div className="space-y-4">
        <Field id="auto-name" label="Name"><Input id="auto-name" value={form.name} onChange={(e) => set("name", e.target.value)} maxLength={60} /></Field>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field id="auto-trigger" label="When">
            <Select id="auto-trigger" value={form.trigger} onChange={(e) => set("trigger", e.target.value as Trigger)}>
              {(Object.keys(TRIGGER_LABEL) as Trigger[]).map((t) => <option key={t} value={t}>{TRIGGER_LABEL[t]}</option>)}
            </Select>
          </Field>
          <Field id="auto-action" label="Then">
            <Select id="auto-action" value={form.action} onChange={(e) => set("action", e.target.value as Action)}>
              {(Object.keys(ACTION_LABEL) as Action[]).map((a) => <option key={a} value={a}>{ACTION_LABEL[a]}</option>)}
            </Select>
          </Field>
        </div>
        {timed && (
          <Field id="auto-offset" label={form.trigger === "DAYS_BEFORE_SHOOT" ? "How long before" : "How long after"} hint="In hours. 24 = one day, 72 = three days.">
            <Input id="auto-offset" type="number" inputMode="numeric" min={0} max={1440} value={form.offsetHours} onChange={(e) => set("offsetHours", Math.max(0, Math.min(1440, Number(e.target.value) || 0)))} />
          </Field>
        )}
        <Field id="auto-message" label="Message" hint={<span>Filled in per person: {VARS.map((v) => <button key={v} type="button" onClick={() => set("messageTemplate", `${form.messageTemplate}${form.messageTemplate.endsWith(" ") || !form.messageTemplate ? "" : " "}{{${v}}}`)} className="mr-1 rounded-md bg-signal-soft text-signal-text px-1.5 py-0.5 text-[11px] font-semibold">{`{{${v}}}`}</button>)}</span>}>
          <Textarea id="auto-message" rows={4} value={form.messageTemplate} onChange={(e) => set("messageTemplate", e.target.value)} className="text-[16px] md:text-sm" />
        </Field>
        {error && <p role="alert" className="text-xs font-medium text-danger-text">{error}</p>}
        <div className="flex items-center gap-2 pt-1">
          <Button onClick={save} loading={pending} loadingLabel="Saving">{existing ? "Save changes" : "Create automation"}</Button>
          <button type="button" onClick={onClose} className="text-xs font-semibold text-ink/65 hover:text-ink px-2 py-1">Cancel</button>
          {existing && !confirmDelete && <button type="button" onClick={() => setConfirmDelete(true)} className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-ink/60 hover:text-danger-text px-2 py-1"><Trash2 className="w-3.5 h-3.5" strokeWidth={2} aria-hidden />Delete</button>}
          {existing && confirmDelete && <span className="ml-auto inline-flex items-center gap-1"><Button size="sm" variant="danger" onClick={remove} loading={pending} loadingLabel="Deleting">Delete</Button><button type="button" onClick={() => setConfirmDelete(false)} className="text-xs text-ink/60 px-2 py-1">Keep</button></span>}
        </div>
        <p className="text-[11px] text-ink/60">Sends on the channel the conversation lives on, or the client&rsquo;s email or phone. If that channel isn&rsquo;t connected, the run is recorded as not delivered — never pretended sent.</p>
      </div>
    </BottomSheet>
  );
}
