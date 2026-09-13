"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { cn, firstName } from "@/lib/utils";
import { useToast } from "@/components/Toaster";
import { advanceBookingStatus } from "@/app/actions/bookings";
import type { Understanding } from "@/lib/understand";

/**
 * The one next step for this conversation, shown as the path it came from: the client's
 * words, what Daythread read in them, and the step it suggests — which you approve with one
 * button. Every field is traceable: intent and day/time come from the message, the rest from
 * the records. Relationship lives in the rail header, so it is not repeated here.
 */
export function UnderstandingCard({
  u,
  who,
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
  /** Kept for callers; the rail header already shows it. */
  relationshipLabel?: string;
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
  ];
  const known = (facts ?? []).filter((f) => !read.some(([k, v]) => k === f.label && v));
  const fields = [...read.filter(([, v]) => v).map(([k, v]) => ({ label: k, value: v as string })), ...known];
  const disabled = (u.nextAction.kind === "confirm" && !bookingId) || (u.nextAction.kind === "book" && !hasService);
  const none = u.nextAction.kind === "none";

  // Three beats, drawn as one path: what they wrote → what Daythread understood → the step
  // it suggests, which waits for you. Nothing is sent from here without your click.
  return (
    <section aria-labelledby="next-step-title" className="relative">
      <ol className="relative">
        <li className="relative pl-6 pb-4 before:absolute before:left-[5px] before:top-[18px] before:bottom-0 before:w-px before:bg-signal-line">
          <span aria-hidden className="absolute left-0 top-[5px] w-[11px] h-[11px] rounded-full border border-ink/25 bg-white" />
          <p className="text-xs text-ink/65">{firstName(who)} wrote</p>
          <p className="mt-1 text-13 text-ink/80 line-clamp-3">&ldquo;{quote}&rdquo;</p>
        </li>
        <li className="relative pl-6 pb-4 before:absolute before:left-[5px] before:top-[18px] before:bottom-0 before:w-px before:bg-signal-line">
          <span aria-hidden className="absolute left-0 top-[5px] w-[11px] h-[11px] rounded-full bg-signal-soft border border-signal/50" />
          <p className="text-xs text-signal-text">Daythread understood</p>
          {fields.length > 0 ? (
            <dl className="mt-1.5 grid grid-cols-[72px_minmax(0,1fr)] gap-x-3 gap-y-1 text-13">
              {fields.slice(0, 4).map((f) => (
                <div key={f.label} className="contents">
                  <dt className="text-ink/65">{f.label}</dt>
                  <dd className="text-ink truncate">{f.value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="mt-1 text-13 text-ink/65">Nothing specific to act on in this message.</p>
          )}
          {u.confidence === "low" && <p className="mt-1.5 text-xs text-warning-text">Unclear message. Check it before acting.</p>}
        </li>
        <li className="relative pl-6">
          <span aria-hidden className={cn("absolute left-0 top-[5px] w-[11px] h-[11px] rounded-full", none ? "border border-ink/25 bg-white" : "bg-signal")} />
          <h2 id="next-step-title" className="text-xs text-ink/65">Suggested next step</h2>
          <p className={cn("mt-1 text-sm font-semibold leading-snug", none ? "text-ink/65" : "text-ink")}>{u.nextAction.label}</p>
          {why && !none && <p className="mt-1 text-13 text-ink/65">{why}</p>}
          {!none && (
            <button
              type="button"
              onClick={act}
              disabled={pending || disabled}
              className="mt-3 w-full inline-flex items-center justify-center h-9 rounded bg-ink text-white text-13 font-medium transition-colors duration-fast hover:bg-[#2A2B30] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/70 focus-visible:ring-offset-2 disabled:opacity-45"
            >
              {actionVerb(u.nextAction.kind)}
            </button>
          )}
          {u.ifNot && !none && <p className="mt-2 text-xs text-ink/65">{u.ifNot}</p>}
          {disabled && u.nextAction.kind === "book" && <p className="mt-1.5 text-xs text-ink/65">Match a service to this inquiry first, below.</p>}
        </li>
      </ol>
      {fields.length > 4 && (
        <details className="group mt-3 pl-6">
          <summary className="inline-flex items-center gap-1 min-h-[28px] text-xs text-ink/65 hover:text-ink cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
            {fields.length - 4} more details
            <ChevronDown className="w-3.5 h-3.5 transition-transform group-open:rotate-180" strokeWidth={1.75} aria-hidden />
          </summary>
          <dl className="mt-1 grid grid-cols-[72px_minmax(0,1fr)] gap-x-3 gap-y-1 text-13">
            {fields.slice(4).map((f) => (
              <div key={f.label} className="contents">
                <dt className="text-ink/65">{f.label}</dt>
                <dd className="text-ink">{f.value}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}
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
