"use client";

import { Mail, MessageSquare } from "lucide-react";
import { useActiveStep, StoryStep, StoryLayout } from "./ScrollStory";

/**
 * Replaces a row of provider logos with the actual causal chain: a message arrives on a
 * channel your client already uses, and becomes a client record / booking / task inside
 * Daythread — without you touching anything. The channel's own visual identity (Instagram's
 * gradient, iMessage green, Gmail's envelope) stays exactly as those products render it —
 * we don't restyle or imply endorsement, we just show what happens after the message lands.
 */
const FLOWS = [
  {
    key: "instagram",
    eyebrow: "Instagram",
    title: "A DM becomes a client.",
    body: "Someone messages your business page. Daythread reads it, creates the client record, and drops it in your inbox — sorted by how ready they are to book.",
  },
  {
    key: "sms",
    eyebrow: "SMS",
    title: "A text becomes a conversation.",
    body: "A number texts your business line. It lands in the same inbox as everything else — no separate app, no missed replies.",
  },
  {
    key: "email",
    eyebrow: "Gmail",
    title: "An email becomes a booking.",
    body: "Your real Gmail inbox connects directly. Replies send from your own account — clients never know there's a system behind it.",
  },
];

export function IntegrationFlows() {
  const { active, refs } = useActiveStep(FLOWS.length);

  return (
    <div>
      <div className="text-center max-w-lg mx-auto mb-4 px-6">
        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-ink/40 mb-3">How it works</div>
        <h2 className="font-display text-3xl md:text-[2.5rem] leading-[1.1] text-ink">Your business already lives in these places.</h2>
      </div>
      <StoryLayout visual={<FlowVisual active={active} />}>
        {FLOWS.map((f, i) => (
          <StoryStep key={f.key} index={i} refs={refs} eyebrow={f.eyebrow} title={f.title} body={f.body} />
        ))}
      </StoryLayout>
    </div>
  );
}

function InstagramGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" strokeWidth="1.75" />
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.75" />
      <circle cx="17" cy="7" r="1" fill="currentColor" />
    </svg>
  );
}

const CHANNEL_META = {
  instagram: { icon: InstagramGlyph, bg: "bg-gradient-to-br from-[#FEDA75] via-[#D62976] to-[#4F5BD5]", sender: "Sarah Johnson", text: "Are you available June 14?" },
  sms: { icon: MessageSquare, bg: "bg-[#2FC26E]", sender: "(512) 555-0148", text: "Do you have anything open next week?" },
  email: { icon: Mail, bg: "bg-[#EA4335]", sender: "priya.patel@gmail.com", text: "Following up on pricing for a September date" },
} as const;

function FlowVisual({ active }: { active: number }) {
  const flow = FLOWS[active];
  const meta = CHANNEL_META[flow.key as keyof typeof CHANNEL_META];
  const outcomes = {
    instagram: { label: "Client created", detail: "Sarah Johnson · Instagram" },
    sms: { label: "Conversation opened", detail: "(512) 555-0148 · SMS" },
    email: { label: "Booking drafted", detail: "Priya Patel · $1,200" },
  } as const;
  const outcome = outcomes[flow.key as keyof typeof outcomes];

  return (
    <div className="w-72 md:w-80 flex flex-col items-center gap-3">
      {/* The incoming message, rendered in the channel's own visual language */}
      <div className="w-full rounded-2xl border border-border bg-white shadow-popover p-4 flex items-start gap-3">
        <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white shrink-0 ${meta.bg}`}>
          <meta.icon className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <div className="text-xs font-medium text-ink truncate">{meta.sender}</div>
          <div className="text-xs text-ink/50 mt-0.5">{meta.text}</div>
        </div>
      </div>

      {/* The thread — literal connective tissue between "their message" and "your business" */}
      <div className="relative w-px h-8 bg-gradient-to-b from-ink/15 to-ink/5">
        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-accent" />
      </div>

      {/* What Daythread did with it — solid ink card, no gradient, reads as "the system" */}
      <div className="w-full rounded-2xl bg-ink text-paper p-4">
        <div className="flex items-center gap-1.5 mb-1">
          <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
          <span className="text-[10px] font-semibold uppercase tracking-wide text-paper/50">Daythread</span>
        </div>
        <div className="text-sm font-medium">{outcome.label}</div>
        <div className="text-xs text-paper/50 mt-0.5">{outcome.detail}</div>
      </div>
    </div>
  );
}
