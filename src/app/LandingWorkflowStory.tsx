"use client";

import { WorkflowCard } from "./WorkflowCard";
import { useActiveStep, StoryStep, StoryLayout } from "./ScrollStory";

const STEPS = [
  { eyebrow: "The lead", title: "A real inquiry comes in", body: "LensFlow reads it and extracts what's actually there — never a guess." },
  { eyebrow: "The booking", title: "One tap to confirm", body: "Client, service, date, and price — prefilled from the conversation." },
  { eyebrow: "The payment", title: "Deposits, tracked", body: "One clear record of what's paid and what's still owed." },
  { eyebrow: "The project", title: "From shoot to delivered", body: "Every booking moves through the same visible pipeline." },
];

export function LandingWorkflowStory() {
  const { active, refs } = useActiveStep(STEPS.length);

  return (
    <StoryLayout visual={<WorkflowCard step={active} />}>
      {STEPS.map((s, i) => (
        <StoryStep key={s.title} index={i} refs={refs} eyebrow={s.eyebrow} title={s.title} body={s.body} />
      ))}
    </StoryLayout>
  );
}
