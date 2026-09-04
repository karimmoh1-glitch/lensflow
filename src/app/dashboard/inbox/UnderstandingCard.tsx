"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/Toaster";
import { advanceBookingStatus } from "@/app/actions/bookings";
import type { Understanding } from "@/lib/understand";

/**
 * Message → context → action. Every field here is traceable: the intent and the day/time
 * were read from the message, the relationship and context from the records, and the
 * action is the one that follows. The button does the thing — it doesn't animate it.
 */
export function UnderstandingCard({
  u,
  who,
  relationshipLabel,
  quote,
  bookingId,
  bookingHref,
  bookingPageUrl,
  hasService,
}: {
  u: Understanding;
  who: string;
  relationshipLabel: string;
  quote: string;
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
          toast({ tone: "outcome", title: "Booking confirmed", body: `${who.split(" ")[0]} is locked in.` });
          router.refresh();
        });
        return;
      case "book":
        document.getElementById("book-from-here")?.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      case "send_link":
        navigator.clipboard?.writeText(bookingPageUrl).then(
          () => toast({ tone: "thinking", title: "Booking link copied", body: "Paste it into your reply." }),
          () => toast({ tone: "neutral", title: bookingPageUrl })
        );
        focusComposer();
        return;
      case "collect":
        router.push("/dashboard/payments");
        return;
      case "reschedule":
        if (bookingHref) router.push(bookingHref);
        else focusComposer();
        return;
      default:
        focusComposer();
    }
  }

  const rows: Array<[string, string | null]> = [
    ["Who", who],
    ["Relationship", relationshipLabel],
    ["Intent", u.intentLabel],
    ["Date", u.day],
    ["Time", u.time],
    ["Amount", u.amountCents ? `$${(u.amountCents / 100).toLocaleString()}` : null],
    ["Context", u.context],
  ];

  const disabled = (u.nextAction.kind === "confirm" && !bookingId) || (u.nextAction.kind === "book" && !hasService);

  return (
    <div className="rounded-2xl border border-border bg-white overflow-hidden">
      <div className="px-4 pt-3.5 pb-3 border-b border-border bg-paper/60">
        <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink/45">Daythread read this</div>
        <p className="mt-1 text-sm text-ink/80 leading-snug">“{quote}”</p>
      </div>
      <dl className="px-4 py-3 grid grid-cols-[92px_1fr] gap-x-3 gap-y-1.5 text-sm">
        {rows.filter(([, v]) => v).map(([k, v], i) => (
          <div key={k} className="contents">
            <dt className="text-ink/50 text-xs pt-0.5">{k}</dt>
            <dd className={cn("font-medium text-ink", k === "Intent" && "text-signal-text", i === 0 && "font-semibold")}>{v}</dd>
          </div>
        ))}
      </dl>
      <div className="px-4 pb-4">
        <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink/45 mb-1.5">Next action</div>
        <button
          type="button"
          onClick={act}
          disabled={pending || disabled || u.nextAction.kind === "none"}
          className={cn(
            "w-full inline-flex items-center justify-center gap-2 h-10 rounded-full text-sm font-extrabold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 disabled:opacity-50",
            u.nextAction.kind === "confirm" || u.nextAction.kind === "book" ? "bg-accent text-white hover:brightness-95 active:scale-[0.98]" : "bg-ink text-white hover:bg-graphite active:scale-[0.98]"
          )}
        >
          {u.nextAction.label}
        </button>
        {disabled && u.nextAction.kind === "book" && <p className="mt-1.5 text-[11px] text-ink/50">Match a service to this lead first, below.</p>}
        {u.confidence === "low" && <p className="mt-1.5 text-[11px] text-ink/45">Read from the message — check it before acting.</p>}
      </div>
    </div>
  );
}

function focusComposer() {
  const el = document.querySelector<HTMLTextAreaElement>("textarea[name=reply], textarea");
  el?.focus();
}
