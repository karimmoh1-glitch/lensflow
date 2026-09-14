"use client";

import { Sparkles } from "lucide-react";
import { PaywallTrigger } from "@/components/Paywall";
import type { PaywallFeature } from "@/lib/paywall";

/**
 * When someone on Free reaches for a Pro feature, the moment should explain, not scold.
 * Every entitlement error the server returns mentions "Daythread Pro" — that phrase is the
 * signal to render this instead of a red line. Anything else is a real error and stays
 * plain. Violet, because this is Daythread telling you what it could do for you.
 */
export function EntitlementNotice({ message }: { message: string }) {
  const isEntitlement = /daythread pro|pro plan/i.test(message);
  if (!isEntitlement) return <p className="text-xs text-danger-text">{message}</p>;

  const feature = /sms|text number/i.test(message) ? "A text number" : /draft|ai/i.test(message) ? "AI-drafted replies" : /team|assign|teammate/i.test(message) ? "Team" : /automation/i.test(message) ? "Unlimited automations" : "This";
  const key: PaywallFeature = feature === "A text number" ? "sms" : feature === "AI-drafted replies" ? "ai_draft" : feature === "Team" ? "team" : feature === "Unlimited automations" ? "automations" : "channels";
  const why =
    feature === "A text number"
      ? "Text people from your own number, inside the same inbox."
      : feature === "AI-drafted replies"
        ? "A reply drafted from the thread, ready to edit and send."
        : feature === "Team"
          ? "Share the inbox with up to five people and assign conversations."
          : feature === "Unlimited automations"
            ? "Run every confirmation, reminder and follow-up at once."
            : "Every channel, AI, and your team on one inbox.";

  return (
    <div className="flex items-start gap-3 rounded-xl border border-signal/25 bg-signal-soft/50 px-3.5 py-3 max-w-sm">
      <span className="w-7 h-7 rounded-lg bg-signal/15 text-signal-text flex items-center justify-center shrink-0 mt-0.5">
        <Sparkles className="w-3.5 h-3.5" strokeWidth={2} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-semibold text-ink">{feature} {feature === "AI-drafted replies" || feature === "Unlimited automations" ? "are" : "is"} part of Pro</div>
        <p className="text-xs text-ink/70 mt-0.5">{why}</p>
        <PaywallTrigger feature={key} source="inline-notice" variant="link" className="mt-2">
          See what Pro includes →
        </PaywallTrigger>
      </div>
    </div>
  );
}
