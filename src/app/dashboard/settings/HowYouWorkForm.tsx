"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input } from "@/components/ui";
import { OptionGrid } from "@/components/onboarding/OptionGrid";
import { useToast } from "@/components/Toaster";
import { updatePersonalization } from "@/app/actions/onboarding";
import {
  USER_TYPES, WORK_CATEGORIES, BUSINESS_STATUSES, TEAM_SIZES, CHANNELS, PAIN_POINTS, FEATURES, TOOLS, BOOKINGS_ANSWERS, TEAM_USAGE,
  answersSchema, asksTeamSize, derivePersonalization, PRIORITY_COPY, type AnswersDraft, type OnboardingAnswers,
} from "@/lib/personalization";

const planName = (p: string) => (p === "PRO" ? "Pro" : p === "BUSINESS" ? "Business" : "Free");

/**
 * "How you work": the /start answers, editable later. Saving re-derives the priorities on
 * Today, the channels the product points at, and the plan recommendation — the same rules
 * as signup, so nothing here is a separate opinion.
 */
export function HowYouWorkForm({ initial }: { initial: OnboardingAnswers | null }) {
  const [draft, setDraft] = useState<AnswersDraft>(initial ?? { channels: [], painPoints: [], desiredFeatures: [], currentTools: [] });
  const [pending, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();
  const parsed = answersSchema.safeParse(draft);
  const preview = parsed.success ? derivePersonalization(parsed.data) : null;
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial ?? {});

  const single = (field: keyof AnswersDraft) => (k: string) => setDraft({ ...draft, [field]: k });
  const multi = (field: "channels" | "painPoints" | "desiredFeatures" | "currentTools") => (k: string) => {
    const cur = (draft[field] as string[] | undefined) ?? [];
    setDraft({ ...draft, [field]: cur.includes(k) ? cur.filter((v) => v !== k) : [...cur, k] });
  };

  const save = () => {
    if (!parsed.success) return;
    start(async () => {
      const res = await updatePersonalization(parsed.data);
      if (!res.ok) { toast({ tone: "signal", title: "Couldn't save", body: res.error }); return; }
      toast({ tone: "outcome", title: "Saved", body: `Today now leads with ${PRIORITY_COPY[res.priorities[0]].title}. We'd recommend ${planName(res.recommendedPlan)}.` });
      router.refresh();
    });
  };

  const Q = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <fieldset className="space-y-2.5">
      <legend className="text-[13px] font-semibold text-ink/80">{label}</legend>
      {children}
    </fieldset>
  );

  return (
    <section aria-labelledby="how-you-work" className="rounded-[22px] border border-border bg-white px-5 py-5">
      <h2 id="how-you-work" className="text-[15px] font-extrabold text-ink">How you work</h2>
      <p className="mt-1 text-sm text-ink/65 leading-relaxed">{initial ? "What you told us when you started. Change anything and Daythread re-orders itself around it." : "Tell Daythread how you work and it puts the right things first — on Today, in empty pages, and in what it recommends."}</p>
      <div className="mt-5 space-y-6">
        <Q label="What do you do?"><OptionGrid label="What do you do?" options={USER_TYPES} value={draft.userType} onChange={single("userType")} columns={3} size="sm" /></Q>
        <Q label="What kind of work do you do?">
          <OptionGrid label="What kind of work do you do?" options={WORK_CATEGORIES} value={draft.workCategory} onChange={single("workCategory")} columns={3} size="sm" />
          {draft.workCategory === "other" && (
            <Field id="workDetail" label="In a few words"><Input id="workDetail" maxLength={80} value={draft.workDetail ?? ""} onChange={(e) => setDraft({ ...draft, workDetail: e.target.value })} placeholder="Dog grooming, tutoring, a bakery…" /></Field>
          )}
        </Q>
        <Q label="Are you using Daythread for a business?"><OptionGrid label="Are you using Daythread for a business?" options={BUSINESS_STATUSES} value={draft.businessStatus} onChange={single("businessStatus")} columns={2} size="sm" /></Q>
        <Q label="Where do your customers usually reach you?"><OptionGrid label="Where do your customers usually reach you?" options={CHANNELS} value={draft.channels} onChange={multi("channels")} multi columns={3} size="sm" /></Q>
        <Q label="What takes the most time or causes the most stress?"><OptionGrid label="What takes the most time or causes the most stress?" options={PAIN_POINTS} value={draft.painPoints} onChange={multi("painPoints")} multi columns={3} size="sm" /></Q>
        <Q label="What would you like Daythread to help you with?"><OptionGrid label="What would you like Daythread to help you with?" options={FEATURES} value={draft.desiredFeatures} onChange={multi("desiredFeatures")} multi columns={3} size="sm" /></Q>
        <Q label="What are you using today?"><OptionGrid label="What are you using today?" options={TOOLS} value={draft.currentTools} onChange={multi("currentTools")} multi columns={3} size="sm" /></Q>
        <Q label="Do customers book appointments or services with you?"><OptionGrid label="Do customers book appointments or services with you?" options={BOOKINGS_ANSWERS} value={draft.bookings} onChange={single("bookings")} columns={3} size="sm" /></Q>
        <Q label="Do you work with other people?"><OptionGrid label="Do you work with other people?" options={TEAM_USAGE} value={draft.teamUsage} onChange={single("teamUsage")} columns={3} size="sm" /></Q>
        {asksTeamSize(draft) && <Q label="How many people are involved?"><OptionGrid label="How many people are involved?" options={TEAM_SIZES} value={draft.teamSize} onChange={single("teamSize")} columns={3} size="sm" /></Q>}
      </div>
      <div className="mt-6 flex flex-col sm:flex-row sm:items-center gap-3">
        <Button onClick={save} disabled={!parsed.success || !dirty} loading={pending} loadingLabel="Saving">Save how I work</Button>
        <p className="text-xs text-ink/65">{preview ? `Today would lead with ${preview.priorities.map((f) => PRIORITY_COPY[f].title).join(", ")}. We'd recommend ${planName(preview.recommendedPlan)}.` : "Answer every question to save."}</p>
      </div>
    </section>
  );
}
