"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { cn, firstName } from "@/lib/utils";
import { useToast } from "@/components/Toaster";
import { advanceBookingStatus } from "@/app/actions/bookings";
import type { Understanding } from "@/lib/understand";

/**
 * The one next step for this conversation. Everything the rail used to repeat three times —
 * why it matters, what Daythread read, what to do — is one card: the reason in a sentence,
 * one button that does the thing, and the evidence folded underneath for anyone who wants to
 * check it. Every field is traceable: intent and day/time come from the message, the rest
 * from the records.
 */
export function UnderstandingCard({
  u,
  who,
  relationshipLabel,
  why,
  quote,
  facts,
  bookingId,
  bookingHref,
  bookingPageUrl,
  hasService,
}: {
  u: Understanding;
  who: string;
  relationshipLabel: string;
  /** Why this conversation matters, in a sentence, when the opportunity rules have one. */
  why?: string | null;
  quote: string;
  /** What the lead record already holds (service, date, location, budget). */
  facts?: Array<{ label: string; value: string }>;
  bookingId: string | null;
  bookingHref: string | null;
  bookingPageUrl: string;
  hasService: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();

  function act() {
    switch (u.nextAction.kind) {
      case "confirm":
        if (!bookingId) return;
        start(async () => {
          await advanceBookingStatus(bookingId, "CONFIRMED");
          toast({ tone: "outcome", title: "Booking confirmed", body: `${firstName(who)} is locked in.` });
          router.refresh();
        });
        return;
      case "book":
        document.getElementById("book-from-here")?.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      case "send_link":
        navigator.clipboard?.writeText(bookingPageUrl).then(
          () => toast({ tone: "neutral", title: "Booking link copied", body: "Paste it into your reply." }),
          () => toast({ tone: "neutral", title: bookingPageUrl })
        );
        focusComposer();
        return;
      case "reschedule":
        if (bookingHref) router.push(bookingHref);
        else focusComposer();
        return;
      default:
        focusComposer();
    }
  }

  const read: Array<[string, string | null]> = [
    ["Intent", u.intentLabel],
    ["Date", u.day],
    ["Time", u.time],
    ["Amount", u.amountCents ? `$${(u.amountCents / 100).toLocaleString()}` : null],
    ["Context", u.context],
    ["Relationship", relationshipLabel],
  ];
  const known = (facts ?? []).filter((f) => !read.some(([k, v]) => k === f.label && v));
  const disabled = (u.nextAction.kind === "confirm" && !bookingId) || (u.nextAction.kind === "book" && !hasService);
  const none = u.nextAction.kind === "none";

  return (
    <section aria-labelledby="next-step-title" className="rounded-xl border border-border bg-white shadow-surface">
      <div className="p-4">
        <h2 id="next-step-title" className="text-xs font-medium text-ink/55">Next step</h2>
        <p className={cn("mt-1 text-[15px] font-semibold leading-snug tracking-[-0.005em]", none ? "text-ink/60" : "text-ink")}>{u.nextAction.label}</p>
        {why && !none && <p className="mt-1 text-13 text-ink/65 leading-snug">{why}</p>}
        {!none && (
          <button
            type="button"
            onClick={act}
            disabled={pending || disabled}
            className="mt-3 w-full inline-flex items-center justify-center h-9 rounded-lg bg-ink text-white text-13 font-semibold transition-[background-color,transform] duration-150 hover:bg-black active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/70 focus-visible:ring-offset-2 disabled:opacity-45"
          >
            {actionVerb(u.nextAction.kind)}
          </button>
        )}
        {u.ifNot && !none && <p className="mt-2 text-xs text-ink/55 leading-snug">{u.ifNot}</p>}
        {disabled && u.nextAction.kind === "book" && <p className="mt-1.5 text-xs text-ink/60">Match a service to this inquiry first, below.</p>}
        {u.confidence === "low" && <p className="mt-1.5 text-xs text-ink/60">Read from the message. Check it before acting.</p>}
      </div>
      <details className="group border-t border-border">
        <summary className="flex items-center gap-1.5 px-4 h-9 text-xs font-medium text-ink/60 hover:text-ink cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
          What Daythread read
          <ChevronDown className="ml-auto w-3.5 h-3.5 transition-transform group-open:rotate-180" strokeWidth={2} aria-hidden />
        </summary>
        <div className="px-4 pb-4">
          <p className="text-13 text-ink/70 leading-snug border-l-2 border-ink/10 pl-2.5">“{quote}”</p>
          <dl className="mt-3 grid grid-cols-[88px_1fr] gap-x-3 gap-y-1.5 text-13">
            {[...read.filter(([, v]) => v).map(([k, v]) => ({ label: k, value: v as string })), ...known].map((f) => (
              <div key={f.label} className="contents">
                <dt className="text-ink/55">{f.label}</dt>
                <dd className="text-ink font-medium">{f.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </details>
    </section>
  );
}

/** The button says what it does; the heading above says what the step is. */
function actionVerb(kind: Understanding["nextAction"]["kind"]): string {
  switch (kind) {
    case "confirm": return "Confirm booking";
    case "book": return "Pick a time";
    case "send_link": return "Copy booking link and reply";
    case "reschedule": return "Open the booking";
    default: return "Write a reply";
  }
}

function focusComposer() {
  const el = document.querySelector<HTMLTextAreaElement>("textarea[name=reply], textarea");
  el?.focus();
}
