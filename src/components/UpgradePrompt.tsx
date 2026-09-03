import Link from "next/link";
import { Sparkles } from "lucide-react";

/**
 * When someone on Free reaches for a Pro feature, the moment should explain, not scold.
 * Every entitlement error the server throws mentions "the Pro plan" — that phrase is the
 * signal to render this instead of a red line. Anything else is a real error and stays
 * plain. Violet, because this is Daythread telling you what it could do for you.
 */
export function EntitlementNotice({ message }: { message: string }) {
  const isEntitlement = /pro plan/i.test(message);
  if (!isEntitlement) return <p className="text-xs text-danger-text">{message}</p>;

  const feature = /automation/i.test(message) ? "Automations" : /sms/i.test(message) ? "SMS" : /draft|ai/i.test(message) ? "AI-drafted replies" : "This";
  const why =
    feature === "Automations"
      ? "Confirmations, reminders, and follow-ups send themselves."
      : feature === "SMS"
        ? "Text your clients from your own number, inside the same inbox."
        : feature === "AI-drafted replies"
          ? "A reply drafted in your voice, ready to edit and send."
          : "Part of running the whole business from one place.";

  return (
    <div className="flex items-start gap-3 rounded-xl border border-signal/25 bg-signal-soft/50 px-3.5 py-3 max-w-sm">
      <span className="w-7 h-7 rounded-lg bg-signal/15 text-signal-text flex items-center justify-center shrink-0 mt-0.5">
        <Sparkles className="w-3.5 h-3.5" strokeWidth={2} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-semibold text-ink">{feature} {feature === "Automations" || feature === "AI-drafted replies" ? "are" : "is"} on Pro</div>
        <p className="text-xs text-ink/70 mt-0.5">{why}</p>
        <Link href="/dashboard/billing" className="inline-block mt-2 text-xs font-bold text-signal-text hover:underline">
          See what Pro includes →
        </Link>
      </div>
    </div>
  );
}
