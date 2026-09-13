import { Check } from "lucide-react";
import { ChannelIcon } from "./ChannelIcon";
import { Reveal } from "./Reveal";

/**
 * One conversation, start to finish, drawn with the product's own pieces: the message as it
 * lands in the inbox, the Next step card exactly as the thread shows it, the open times from
 * your calendar, the booking confirmation your automation sends (its real template), and the
 * thank-you recipe. Nothing here is a capability the product doesn't have, and nothing is
 * sent without either you or an automation you switched on.
 */
const STEPS = [
  { key: "message", step: "A message arrives", note: "On whatever channel they use." },
  { key: "read", step: "Daythread reads it", note: "Who they are, what they want, when." },
  { key: "time", step: "You pick the time", note: "From your real availability." },
  { key: "confirm", step: "They're told where they wrote", note: "Your confirmation, on Instagram." },
  { key: "after", step: "The follow-up is handled", note: "Switched on once. Runs every time." },
] as const;

export function Flow() {
  return (
    <div className="max-w-[1200px] mx-auto px-6">
      <Reveal className="max-w-2xl">
        <h2 className="font-sans font-bold text-[clamp(2.1rem,4.2vw,3.4rem)] leading-[1] tracking-[-0.04em] text-ink text-balance">From message to booked.</h2>
        <p className="mt-4 text-[1.0625rem] text-ink/60 leading-relaxed">One conversation, start to finish, without leaving it.</p>
      </Reveal>

      <ol className="relative mt-12 md:mt-16">
        <span aria-hidden className="absolute left-[11px] md:left-[calc(260px+11px)] top-3 bottom-3 w-px bg-gradient-to-b from-ink/15 via-ink/15 to-transparent" />
        {STEPS.map((s, i) => (
          <li key={s.key} className="relative grid grid-cols-[24px_minmax(0,1fr)] md:grid-cols-[260px_24px_minmax(0,1fr)] gap-x-4 md:gap-x-6 pb-10 md:pb-14 last:pb-0">
            <div className="hidden md:block pt-1 text-right">
              <p className="text-[15px] font-semibold text-ink tracking-[-0.01em]">{s.step}</p>
              <p className="mt-0.5 text-13 text-ink/55">{s.note}</p>
            </div>
            <span aria-hidden className="relative z-10 mt-1.5 w-[23px] h-[23px] rounded-full bg-paper border border-ink/15 flex items-center justify-center">
              <span className={i === STEPS.length - 1 ? "w-2 h-2 rounded-full bg-ink/30" : i === 0 ? "w-2 h-2 rounded-full bg-accent" : "w-2 h-2 rounded-full bg-ink"} />
            </span>
            <div className="min-w-0">
              <div className="md:hidden mb-3">
                <p className="text-[15px] font-semibold text-ink">{s.step}</p>
                <p className="text-13 text-ink/55">{s.note}</p>
              </div>
              <Reveal>
                <Fragment k={s.key} />
              </Reveal>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

const card = "rounded-xl border border-border bg-white shadow-[0_1px_0_rgba(16,17,20,0.03),0_12px_32px_-20px_rgba(16,17,20,0.25)]";

function Fragment({ k }: { k: (typeof STEPS)[number]["key"] }) {
  if (k === "message") {
    return (
      <div className={`${card} max-w-md p-4`}>
        <div className="flex items-center gap-2.5">
          <span className="w-8 h-8 rounded-full bg-ink/[0.06] text-ink/75 text-2xs font-semibold flex items-center justify-center">MC</span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink leading-5">Maya Chen</p>
            <p className="text-xs text-ink/55 flex items-center gap-1.5"><ChannelIcon k="instagram" size={14} /> Instagram · just now</p>
          </div>
          <span aria-hidden className="ml-auto w-2.5 h-2.5 rounded-full bg-accent" />
        </div>
        <p className="mt-3 inline-block rounded-2xl rounded-tl-md bg-black/[0.045] px-3.5 py-2.5 text-sm text-ink leading-relaxed">
          Hi! Can you do <mark className="bg-accent-soft text-ink rounded px-0.5">Friday at 2</mark> for a portrait session?
        </p>
      </div>
    );
  }
  if (k === "read") {
    return (
      <div className="flex flex-col lg:flex-row gap-3 max-w-2xl">
        <div className={`${card} p-4 lg:w-[300px] shrink-0`}>
          <p className="text-xs font-medium text-ink/55">Next step</p>
          <p className="mt-1 text-[15px] font-semibold text-ink leading-snug">Book them on Friday at 2:00 PM</p>
          <p className="mt-1 text-13 text-ink/60">Asked about Portrait session.</p>
          <span className="mt-3 flex items-center justify-center h-9 rounded-lg bg-ink text-white text-13 font-semibold">Pick a time</span>
        </div>
        <dl className={`${card} p-4 grid grid-cols-[84px_1fr] gap-x-3 gap-y-2 text-13 content-start lg:w-[260px]`}>
          {[["Intent", "Wants to book"], ["Date", "Friday"], ["Time", "2:00 PM"], ["Service", "Portrait session"], ["Context", "Returning client"]].map(([a, b]) => (
            <div key={a} className="contents"><dt className="text-ink/55">{a}</dt><dd className="font-medium text-ink">{b}</dd></div>
          ))}
        </dl>
      </div>
    );
  }
  if (k === "time") {
    return (
      <div className={`${card} max-w-md p-4`}>
        <p className="text-xs font-medium text-ink/55">Open times · Fri, Sep 18</p>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {["10:00 AM", "11:30 AM", "2:00 PM", "4:30 PM"].map((t) => (
            <span key={t} className={t === "2:00 PM" ? "h-8 px-2.5 inline-flex items-center rounded-md border border-ink bg-ink text-white text-xs font-medium" : "h-8 px-2.5 inline-flex items-center rounded-md border border-ink/[0.12] bg-white text-ink text-xs font-medium"}>{t}</span>
          ))}
        </div>
        <div className="mt-3 rounded-lg border border-border bg-paper/70 p-3">
          <p className="text-13 text-ink"><span className="font-semibold">Portrait session</span> · Fri, Sep 18 at 2:00 PM</p>
          <p className="mt-0.5 text-xs text-ink/55">60 min · checked against your Google Calendar</p>
          <span className="mt-2.5 inline-flex items-center h-8 px-3 rounded-lg bg-ink text-white text-13 font-semibold">Book it</span>
        </div>
      </div>
    );
  }
  if (k === "confirm") {
    return (
      <div className={`${card} max-w-md p-4`}>
        <div className="flex justify-end">
          <p className="max-w-[88%] rounded-2xl rounded-tr-md bg-ink text-white px-3.5 py-2.5 text-sm leading-relaxed">
            Hi Maya — you&rsquo;re booked for Portrait session on Friday, Sep 18 at 2:00 PM with Alex Rivera Photography. Reply here if anything changes. See you then!
          </p>
        </div>
        <p className="mt-2 text-right text-xs text-ink/55 flex items-center justify-end gap-1.5"><Check className="w-3.5 h-3.5 text-success" strokeWidth={2.5} aria-hidden />Sent on Instagram by your confirmation automation</p>
      </div>
    );
  }
  return (
    <div className={`${card} max-w-md p-4 flex items-start gap-3`}>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink">Thank them afterwards</p>
        <p className="mt-1 text-13 text-ink/60 leading-snug">When a booking is completed · wait 1 day · send a thank-you on the channel they wrote from</p>
      </div>
      <span aria-hidden className="mt-0.5 w-9 h-5 rounded-full bg-ink relative shrink-0"><span className="absolute right-0.5 top-0.5 w-4 h-4 rounded-full bg-white" /></span>
    </div>
  );
}
