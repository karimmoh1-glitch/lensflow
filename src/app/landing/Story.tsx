import type { CSSProperties, ReactNode } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { ChannelIcon } from "./ChannelIcon";
import { ScrollScene } from "./Scroll";
import { Reveal } from "./Reveal";
import type { ChannelStatus } from "./channelStatus";

/**
 * One client, start to finish, told by the product's own pieces and driven by the scroll:
 *
 *   inquiry       the message lands in the thread
 *   conversation  Daythread reads it — who, what, when — and writes the next step
 *   booking       you pick a time from your real availability and book it
 *   confirmed     the confirmation goes back out where they wrote, by your automation
 *   client        the follow-through runs itself; they're a client now
 *
 * On a wide screen the stage is pinned and the scroll plays the sequence forward and back;
 * on a phone, and under reduced motion, the same five beats stack and read top to bottom.
 * Nothing here is a capability the product doesn't have, and nothing is sent without you
 * or an automation you switched on. The person is fiction.
 */
const BEATS = [
  { key: "inquiry", label: "Inquiry", title: "A message arrives.", body: "On whatever channel they use. It lands in one list, sorted by who has waited longest.", at: [0, 0.02, 0.17, 0.21] },
  { key: "read", label: "Conversation", title: "Daythread reads it.", body: "Who this is, what they want, when. The next step is written for you.", at: [0.19, 0.24, 0.37, 0.41] },
  { key: "book", label: "Booking", title: "You pick the time.", body: "From your real availability, checked against your calendar. One click books it.", at: [0.39, 0.44, 0.57, 0.61] },
  { key: "confirm", label: "Confirmed", title: "They're told where they wrote.", body: "Your confirmation goes out on the same channel, sent by the automation you switched on.", at: [0.59, 0.64, 0.77, 0.81] },
  { key: "client", label: "Client", title: "The follow-through runs itself.", body: "A reminder the day before, a thank-you after. Switched on once, written into the thread every time.", at: [0.79, 0.84] },
] as const;

export function Story({ instagram }: { instagram: ChannelStatus }) {
  return (
    <>
      {/* Wide screens: pinned, scroll-driven. Hidden under reduced motion (see globals.css). */}
      <ScrollScene as="div" span="pin" className="dt-pinned hidden lg:block relative h-[400vh]" aria-hidden>
        <div className="sticky top-0 h-[100svh] flex items-center overflow-hidden">
          <div className="w-full max-w-[1200px] mx-auto px-6 grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] gap-16 items-center">
            <div>
              <ol className="flex items-center gap-x-4 gap-y-1 flex-wrap text-13 font-medium text-ink/40 mb-8">
                {BEATS.map((b) => (
                  <li key={b.key} className="relative">
                    {b.label}
                    <Step a={b.at[0]} b={b.at[1]} c={b.at[2]} d={b.at[3]} dy="0px" className="absolute inset-0 text-ink font-semibold">
                      {b.label}
                    </Step>
                  </li>
                ))}
              </ol>
              <div className="relative h-[260px]">
                {BEATS.map((b) => (
                  <Step key={b.key} a={b.at[0]} b={b.at[1]} c={b.at[2]} d={b.at[3]} dy="18px" className="absolute inset-0">
                    <h2 className="font-sans font-bold text-[clamp(2.1rem,3.6vw,3.2rem)] leading-[1] tracking-[-0.04em] text-ink text-balance">{b.title}</h2>
                    <p className="mt-4 text-[1.0625rem] text-ink/60 leading-relaxed max-w-sm">{b.body}</p>
                  </Step>
                ))}
              </div>
            </div>
            <Stage instagram={instagram} />
          </div>
        </div>
      </ScrollScene>

      {/* Phones, and reduced motion: the same beats, stacked. */}
      <div className="dt-stacked lg:hidden max-w-[1200px] mx-auto px-6">
        <ol className="space-y-14">
          {BEATS.map((b, i) => (
            <li key={b.key}>
              <Reveal>
                <p className="text-13 font-medium text-ink/60">
                  {i + 1} · {b.label}
                </p>
                <h2 className="mt-2 font-sans font-bold text-[1.9rem] leading-[1.02] tracking-[-0.035em] text-ink text-balance">{b.title}</h2>
                <p className="mt-3 text-[15px] text-ink/60 leading-relaxed">{b.body}</p>
                <div className="mt-6">
                  <Still beat={b.key} instagram={instagram} />
                </div>
              </Reveal>
            </li>
          ))}
        </ol>
      </div>
    </>
  );
}

/** An element that appears between --a and --b of the scene and, if given, leaves between --c and --d. */
function Step({ as: Tag = "div", a, b, c, d, dy, ds, className, style, children }: { as?: "div" | "span"; a: number; b: number; c?: number; d?: number; dy?: string; ds?: number; className?: string; style?: CSSProperties; children?: ReactNode }) {
  const vars: Record<string, string | number> = { "--a": a, "--b": b };
  if (c !== undefined && d !== undefined) {
    vars["--c"] = c;
    vars["--d"] = d;
  }
  if (dy) vars["--dy"] = dy;
  if (ds) vars["--ds"] = ds;
  return (
    <Tag className={cn("dt-step", Tag === "span" && "block", className)} style={{ ...vars, ...style } as CSSProperties}>
      {children}
    </Tag>
  );
}

const frame = "rounded-xl border border-border bg-white shadow-[0_1px_0_rgba(16,17,20,0.03),0_30px_70px_-40px_rgba(16,17,20,0.35)]";

/** The pinned stage: the product window, thread on the left, the rail on the right. */
function Stage({ instagram }: { instagram: ChannelStatus }) {
  return (
    <div className={cn(frame, "relative overflow-hidden grid grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] h-[560px]")}>
      <div className="min-w-0 flex flex-col border-r border-border">
        <ThreadHeader instagram={instagram} live />
        <div className="flex-1 px-4 py-4 space-y-3">
          <Step a={0.02} b={0.1} dy="14px">
            <Inbound highlightAt={0.2} />
          </Step>
          <Step a={0.22} b={0.3} c={0.83} d={0.88} dy="8px">
            <ReadChips />
          </Step>
          <Step a={0.61} b={0.69} dy="14px">
            <Outbound instagram={instagram} />
          </Step>
          <Step a={0.85} b={0.92} dy="14px">
            <ThankYou />
          </Step>
        </div>
      </div>
      <div className="relative min-w-0 bg-paper/60 p-4">
        <Step a={0.1} b={0.15} c={0.23} d={0.27} dy="0px" className="absolute inset-4">
          <p className="text-xs font-medium text-ink/60">Next step</p>
          <p className="mt-1 text-[15px] font-semibold text-ink/40">Reading the message…</p>
        </Step>
        <Step a={0.25} b={0.32} c={0.41} d={0.46} dy="16px" className="absolute inset-4">
          <NextStep />
        </Step>
        <Step a={0.43} b={0.5} c={0.61} d={0.66} dy="16px" className="absolute inset-4">
          <Slots />
        </Step>
        <Step a={0.63} b={0.7} c={0.81} d={0.86} dy="16px" className="absolute inset-4">
          <Booked />
        </Step>
        <Step a={0.83} b={0.9} dy="16px" className="absolute inset-4">
          <ClientCard />
        </Step>
      </div>
    </div>
  );
}

/** The stacked version: each beat's piece, at rest. */
function Still({ beat, instagram }: { beat: (typeof BEATS)[number]["key"]; instagram: ChannelStatus }) {
  if (beat === "inquiry") {
    return (
      <div className={cn(frame, "overflow-hidden")}>
        <ThreadHeader instagram={instagram} />
        <div className="px-4 py-4">
          <Inbound />
        </div>
      </div>
    );
  }
  if (beat === "read") {
    return (
      <div className="space-y-3">
        <div className={cn(frame, "px-4 py-4")}>
          <Inbound highlightAt={0} />
          <div className="mt-3">
            <ReadChips />
          </div>
        </div>
        <div className={cn(frame, "p-4")}>
          <NextStep />
        </div>
      </div>
    );
  }
  if (beat === "book") {
    return (
      <div className={cn(frame, "p-4")}>
        <Slots />
      </div>
    );
  }
  if (beat === "confirm") {
    return (
      <div className="space-y-3">
        <div className={cn(frame, "px-4 py-4")}>
          <Outbound instagram={instagram} />
        </div>
        <div className={cn(frame, "p-4")}>
          <Booked />
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className={cn(frame, "px-4 py-4")}>
        <ThankYou />
      </div>
      <div className={cn(frame, "p-4")}>
        <ClientCard />
      </div>
    </div>
  );
}

// ── The pieces, drawn as the product draws them ─────────────────────────────

function ThreadHeader({ instagram, live }: { instagram: ChannelStatus; live?: boolean }) {
  return (
    <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border">
      <span className="w-8 h-8 rounded-full bg-ink/[0.06] text-ink/75 text-2xs font-semibold flex items-center justify-center">MC</span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-ink leading-5">Maya Chen</p>
        <p className="text-xs text-ink/60 flex items-center gap-1.5">
          <ChannelIcon k="instagram" size={14} /> Instagram · @maya.makes
          {instagram !== "Live" && <span className="text-2xs font-medium text-ink/50 rounded-md bg-black/[0.04] px-1.5">{instagram}</span>}
        </p>
      </div>
      {live ? (
        <Step as="span" a={0} b={0.01} c={0.6} d={0.66} dy="0px" className="ml-auto w-2.5 h-2.5 rounded-full bg-accent" />
      ) : (
        <span aria-hidden className="ml-auto w-2.5 h-2.5 rounded-full bg-accent" />
      )}
    </div>
  );
}

function Inbound({ highlightAt }: { highlightAt?: number }) {
  const phrase = <>Friday at 2</>;
  return (
    <div>
      <p className="inline-block max-w-[88%] rounded-2xl rounded-tl-md bg-black/[0.045] px-3.5 py-2.5 text-13 text-ink leading-relaxed">
        Hi! Can you do{" "}
        {highlightAt === undefined ? (
          phrase
        ) : (
          <span className="relative">
            <span className="relative z-10">{phrase}</span>
            <Step as="span" a={highlightAt} b={highlightAt + 0.05} dy="0px" className="absolute -inset-x-0.5 -inset-y-px rounded bg-accent-soft" />
          </span>
        )}{" "}
        for a portrait session?
      </p>
      <p className="mt-1 text-2xs text-ink/50">Just now</p>
    </div>
  );
}

function ReadChips() {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-2xs font-medium text-ink/55 mr-1">Daythread read</span>
      {[["Intent", "Wants to book"], ["Date", "Friday"], ["Time", "2:00 PM"], ["Service", "Portrait session"], ["Context", "Returning client"]].map(([k, v]) => (
        <span key={k} className="inline-flex items-center gap-1 rounded-md bg-black/[0.045] px-1.5 py-0.5 text-2xs font-medium text-ink/75">
          <span className="text-ink/55">{k}</span>
          {v}
        </span>
      ))}
    </div>
  );
}

function NextStep() {
  return (
    <div>
      <p className="text-xs font-medium text-ink/60">Next step</p>
      <p className="mt-1 text-[15px] font-semibold text-ink leading-snug">Book them on Friday at 2:00 PM</p>
      <p className="mt-1 text-13 text-ink/60">Asked about Portrait session.</p>
      <span className="mt-3 flex items-center justify-center h-9 rounded-lg bg-ink text-white text-13 font-semibold">Pick a time</span>
      <dl className="mt-4 grid grid-cols-[84px_1fr] gap-x-3 gap-y-1.5 text-13">
        {[["Intent", "Wants to book"], ["Date", "Friday"], ["Time", "2:00 PM"], ["Service", "Portrait session"], ["Context", "Returning client"]].map(([a, b]) => (
          <div key={a} className="contents">
            <dt className="text-ink/60">{a}</dt>
            <dd className="font-medium text-ink">{b}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function Slots() {
  return (
    <div>
      <p className="text-xs font-medium text-ink/60">Open times · Fri, Sep 18</p>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {["10:00 AM", "11:30 AM", "2:00 PM", "4:30 PM"].map((t) => (
          <span key={t} className={t === "2:00 PM" ? "h-8 px-2.5 inline-flex items-center rounded-md border border-ink bg-ink text-white text-xs font-medium" : "h-8 px-2.5 inline-flex items-center rounded-md border border-ink/[0.12] bg-white text-ink text-xs font-medium"}>
            {t}
          </span>
        ))}
      </div>
      <div className="mt-3 rounded-lg border border-border bg-white p-3">
        <p className="text-13 text-ink">
          <span className="font-semibold">Portrait session</span> · Fri, Sep 18 at 2:00 PM
        </p>
        <p className="mt-0.5 text-xs text-ink/60">60 min · checked against your Google Calendar</p>
        <span className="mt-2.5 inline-flex items-center h-8 px-3 rounded-lg bg-ink text-white text-13 font-semibold">Book it</span>
      </div>
    </div>
  );
}

function Outbound({ instagram }: { instagram: ChannelStatus }) {
  return (
    <div>
      <div className="flex justify-end">
        <p className="max-w-[88%] rounded-2xl rounded-tr-md bg-ink text-white px-3.5 py-2.5 text-13 leading-relaxed">
          Hi Maya — you&rsquo;re booked for Portrait session on Friday, Sep 18 at 2:00 PM with Alex Rivera Photography. Reply here if anything changes. See you then!
        </p>
      </div>
      <p className="mt-1.5 text-right text-2xs text-ink/55 flex items-center justify-end gap-1.5">
        <Check className="w-3 h-3 text-success" strokeWidth={2.5} aria-hidden />
        Sent on Instagram{instagram !== "Live" ? ` (${instagram.toLowerCase()})` : ""} by your confirmation automation
      </p>
    </div>
  );
}

function ThankYou() {
  return (
    <div>
      <div className="flex justify-end">
        <p className="max-w-[88%] rounded-2xl rounded-tr-md bg-ink text-white px-3.5 py-2.5 text-13 leading-relaxed">Thank you, Maya — it was a pleasure. I&rsquo;ll be in touch as soon as everything is ready.</p>
      </div>
      <p className="mt-1.5 text-right text-2xs text-ink/55 flex items-center justify-end gap-1.5">
        <Check className="w-3 h-3 text-success" strokeWidth={2.5} aria-hidden />
        Sent a day after the session by your thank-you automation
      </p>
    </div>
  );
}

function Booked() {
  return (
    <div>
      <p className="text-xs font-medium text-ink/60">Booking</p>
      <p className="mt-1 text-[15px] font-semibold text-ink leading-snug">Portrait session · Fri, Sep 18 · 2:00 PM</p>
      <p className="mt-1 text-13 text-ink/60">60 min · $250</p>
      <ul className="mt-3 space-y-1.5 text-13">
        {["Confirmed on Instagram", "On your Google Calendar", "Reminder set for the day before"].map((t) => (
          <li key={t} className="flex items-center gap-2 text-ink">
            <Check className="w-3.5 h-3.5 text-success shrink-0" strokeWidth={2.5} aria-hidden />
            {t}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ClientCard() {
  return (
    <div>
      <div className="flex items-center gap-3">
        <span className="w-10 h-10 rounded-full bg-ink/[0.06] text-ink/75 text-xs font-semibold flex items-center justify-center">MC</span>
        <div className="min-w-0">
          <p className="text-[15px] font-semibold text-ink leading-tight">Maya Chen</p>
          <p className="text-13 text-ink/60">Client · 1 booking · Instagram</p>
        </div>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-13">
        <div>
          <dt className="text-ink/60">Upcoming</dt>
          <dd className="font-medium text-ink">Portrait session · Sep 18</dd>
        </div>
        <div>
          <dt className="text-ink/60">Came in via</dt>
          <dd className="font-medium text-ink">Instagram · Sep</dd>
        </div>
      </dl>
      <div className="mt-4 rounded-lg border border-border bg-white px-3 py-2.5 flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-13 font-semibold text-ink">Thank them afterwards</p>
          <p className="text-2xs text-ink/60 leading-snug">A day after the session, on the channel they wrote from</p>
        </div>
        <span aria-hidden className="w-9 h-5 rounded-full bg-ink relative shrink-0">
          <span className="absolute right-0.5 top-0.5 w-4 h-4 rounded-full bg-white" />
        </span>
      </div>
    </div>
  );
}
