"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { ChannelIcon, CHANNEL, type ChannelKey } from "./ChannelIcon";
import type { ChannelStatus } from "./channelStatus";

/**
 * The hero: many inputs → one system → one result, told by the information itself.
 *
 * Every few seconds one channel lights up and its actual message — a chip with the words
 * in it — travels the connector into Daythread. The product responds in order: it reads
 * who this is (real lead extraction: service, date, intent), it acts (a booking or a
 * booking link), the outcome lands (a confirmation, a reply), and the one thing left
 * to do surfaces. Hovering or clicking a channel makes it that channel's turn.
 *
 * The first paint is the completed panel — the richest frame — so the hero is whole
 * before JavaScript and in any screenshot. Reduced motion: that frame, still.
 */
type Story = {
  k: ChannelKey;
  who: string;
  handle: string;
  msg: string;
  highlight: string;
  extracted: [string, string][];
  ctx: string;
  ctxMeta: string;
  action: string;
  outcome: string;
  next: string;
  nextWhy: string;
};

const STORIES: Story[] = [
  {
    k: "instagram", who: "Maya Chen", handle: "@maya.makes", msg: "Hey! Are you free Friday at 2 for a portrait session?", highlight: "Friday at 2",
    extracted: [["Date", "Friday · 2:00 PM"], ["Service", "Portrait session"]], ctx: "Returning client", ctxMeta: "Booked twice before",
    action: "Friday 2:00 PM is open", outcome: "You booked it · confirmation sent on Instagram", next: "Nothing to do", nextWhy: "She was told where she wrote.",
  },
  {
    k: "gmail", who: "Jordan Lee", handle: "jordan@northloop.co", msg: "Following up on pricing for a September date.", highlight: "September",
    extracted: [["Date", "September"], ["Intent", "Pricing"]], ctx: "Potential client · asked twice", ctxMeta: "First wrote 9 days ago",
    action: "Reply drafted from your prices", outcome: "Waiting for your approval", next: "Approve and send", nextWhy: "Inquiries go cold fast. This one is 9 days old.",
  },
  {
    k: "sms", who: "(512) 555-0148", handle: "New number", msg: "Do you have anything open next week?", highlight: "next week",
    extracted: [["Date", "Next week"], ["Intent", "Availability"]], ctx: "New inquiry · contact created", ctxMeta: "First message from this number",
    action: "Open times found for next week", outcome: "Waiting on your reply", next: "Send times next week", nextWhy: "Answering first is how the booking is won.",
  },
  {
    k: "whatsapp", who: "Sam Okafor", handle: "+1 415 …", msg: "Can we move Thursday to 4pm?", highlight: "Thursday to 4pm",
    extracted: [["Date", "Thu · 4:00 PM"], ["Intent", "Reschedule"]], ctx: "Client · booked Thursday", ctxMeta: "Consult · confirmed",
    action: "Thursday 4:00 PM is open", outcome: "You moved it · Sam was told on WhatsApp", next: "Nothing to do", nextWhy: "The calendar and the reminder moved with it.",
  },
  {
    k: "website", who: "Priya Patel", handle: "Booking page", msg: "Booked the Full package for Sep 18.", highlight: "Full package",
    extracted: [["Service", "Full package"], ["Date", "Sep 18"]], ctx: "New client", ctxMeta: "Came in through your booking page",
    action: "Booked through your booking page", outcome: "On your calendar · confirmation sent", next: "Nothing to do", nextWhy: "It arrived with everything filled in.",
  },
];

const PANEL_IN_Y = 150;
const gutterPath = (i: number) => `M 0 ${30 + i * 60} C 60 ${30 + i * 60}, 60 ${PANEL_IN_Y}, 120 ${PANEL_IN_Y}`;

export function HeroThread({ status }: { status: Record<ChannelKey, ChannelStatus> }) {
  const [active, setActive] = useState<ChannelKey>("instagram");
  const [shown, setShown] = useState<ChannelKey>("instagram");
  const [phase, setPhase] = useState<0 | 1 | 2 | 3 | 4>(4); // 0 in flight · 1 read · 2 acted · 3 outcome · 4 next
  const [still, setStill] = useState(false);
  const [travelKey, setTravelKey] = useState(0);
  const touched = useRef<number>(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const play = (next: ChannelKey) => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    const later = (fn: () => void, ms: number) => timers.current.push(setTimeout(fn, ms));
    setActive(next);
    setPhase(0);
    setTravelKey((n) => n + 1);
    later(() => { setShown(next); setPhase(1); }, 900);
    later(() => setPhase(2), 1700);
    later(() => setPhase(3), 2400);
    later(() => setPhase(4), 3100);
  };

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setStill(true);
      return;
    }
    let i = 0;
    const loop = setInterval(() => {
      if (Date.now() - touched.current < 6000) return; // the visitor is driving
      i = (i + 1) % STORIES.length;
      play(STORIES[i].k);
    }, 5600);
    return () => {
      clearInterval(loop);
      timers.current.forEach(clearTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pick(k: ChannelKey) {
    if (still || k === active) return;
    touched.current = Date.now();
    play(k);
  }

  const s = STORIES.find((x) => x.k === shown)!;
  const a = STORIES.find((x) => x.k === active)!;
  const brand = CHANNEL[active].brand;
  const inFlight = phase === 0 && !still;
  const on = (n: number) => still || inFlight || phase >= n;
  const idx = STORIES.findIndex((x) => x.k === active);

  return (
    <div className="relative w-full select-none" aria-label="Messages from Instagram, Gmail, texts, WhatsApp and your booking page flowing into one Daythread">
      {/* ambient: the active channel's color, softly, behind the product */}
      <div aria-hidden className="absolute -inset-10 rounded-[40px] blur-3xl transition-colors duration-700 pointer-events-none" style={{ background: `radial-gradient(60% 60% at 70% 50%, ${brand}22, transparent 70%)` }} />

      <div className="relative grid grid-cols-1 sm:grid-cols-[64px_120px_minmax(0,1fr)] items-center gap-y-5">
        {/* Channels */}
        <ul className="flex sm:flex-col justify-center gap-2.5 sm:gap-[4px]" aria-label="Channels" style={{ transform: "translate(calc(var(--mx) * 5px), calc(var(--my) * 4px))", transition: "transform 700ms cubic-bezier(0.16,1,0.3,1)" }}>
          {STORIES.map((st) => (
            <li key={st.k} className="sm:h-[60px] flex items-center justify-center">
              <button
                type="button"
                aria-pressed={st.k === active}
                aria-label={`Show ${CHANNEL[st.k].name}${status[st.k] !== "Live" ? ` (${status[st.k].toLowerCase()})` : ""}`}
                onMouseEnter={() => pick(st.k)}
                onClick={() => pick(st.k)}
                className="relative rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/70 focus-visible:ring-offset-2"
              >
                <ChannelIcon k={st.k} size={56} active={st.k === active} className={cn("max-[359px]:!w-11 max-[359px]:!h-11", st.k === active ? "" : "opacity-75 hover:opacity-100")} />
                {status[st.k] !== "Live" && (
                  <span aria-hidden className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-white px-1.5 py-px text-2xs leading-none font-medium text-ink/70 shadow-surface">
                    {status[st.k] === "Beta" ? "Beta" : "Soon"}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>

        {/* Gutter: connectors + the message travelling (sm+) */}
        <div className="hidden sm:block relative h-[300px]">
          <svg className="absolute inset-0 w-full h-full" viewBox="0 0 120 300" preserveAspectRatio="none" fill="none" aria-hidden>
            <defs>
              <linearGradient id="dt-hero-grad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stopColor={brand} />
                <stop offset="1" stopColor="#101114" />
              </linearGradient>
            </defs>
            {STORIES.map((st, i) => {
              const d = gutterPath(i);
              const isOn = st.k === active;
              const c = CHANNEL[st.k].brand === "#101114" ? "#3A3B40" : CHANNEL[st.k].brand;
              return (
                <g key={st.k}>
                  <path d={d} stroke="rgba(16,17,20,0.08)" strokeWidth="1.5" />
                  <path d={d} stroke="url(#dt-hero-grad)" strokeWidth="2.5" strokeLinecap="round" className="transition-opacity duration-300" style={{ opacity: isOn ? 1 : 0 }} />
                  {/* a quiet, continuous flow on every channel — the system is always listening;
                      brighter and faster on the one that's speaking */}
                  {!still &&
                    [0, 1].map((n) => (
                      <circle key={n} r={isOn ? 2.2 : 1.4} fill={c} opacity={isOn ? 0.9 : 0.35}>
                        <animateMotion dur={isOn ? "1.6s" : "3.2s"} begin={`${i * 0.4 + n * (isOn ? 0.8 : 1.6)}s`} repeatCount="indefinite" path={d} />
                      </circle>
                    ))}
                </g>
              );
            })}
          </svg>
          {inFlight && (
            <div
              key={travelKey}
              aria-hidden
              className="dt-travel absolute left-0 top-0 max-w-[200px] rounded-xl bg-white border px-2.5 py-1.5 text-2xs leading-tight text-ink shadow-popover whitespace-nowrap overflow-hidden text-ellipsis"
              style={{ offsetPath: `path("${gutterPath(idx)}")`, offsetRotate: "0deg", borderColor: `${brand}66` }}
            >
              {a.msg}
            </div>
          )}
        </div>

        {/* Daythread */}
        <div
          className={cn("relative rounded-2xl border border-border bg-white overflow-hidden shadow-[0_32px_80px_-32px_rgba(16,17,20,0.35),0_2px_6px_rgba(16,17,20,0.05)]", phase === 1 && !still && "dt-pulse")}
          style={{ ["--dt-pulse" as string]: `${brand}55` }}
        >
          <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border bg-paper/70">
            <svg viewBox="0 0 24 24" className="w-4 h-4 text-ink" fill="none"><path d="M4 18C9 18 9 6 15 6C17 6 18.5 7.5 20 9" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" /></svg>
            <span className="text-13 font-extrabold tracking-tight text-ink">Daythread</span>
            <span className="text-2xs text-ink/65">Inbox</span>
            <span className={cn("ml-auto text-2xs font-semibold rounded-md px-1.5 py-0.5 transition-colors", inFlight ? "bg-accent-soft text-accent-text" : phase < 4 ? "bg-black/[0.05] text-ink/70" : "bg-success-soft text-success-text")}>
              {inFlight ? "Incoming" : phase < 4 ? "Reading" : "Handled"}
            </span>
          </div>

          <div className={cn("grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_200px] lg:grid-cols-1 xl:grid-cols-[minmax(0,1fr)_200px] transition-opacity duration-500", inFlight ? "opacity-40" : "opacity-100")}>
            <ol className="relative pl-9 pr-4 py-4 min-h-[300px]">
              <span aria-hidden className="absolute left-[19px] top-4 bottom-4 w-px bg-border" />
              <span aria-hidden className="absolute left-[19px] top-4 w-px bg-gradient-to-b from-accent via-ink/40 to-success origin-top transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]" style={{ height: "calc(100% - 2rem)", transform: `scaleY(${still || inFlight ? 1 : phase / 4})` }} />
              <Node on={on(1)} dot="bg-accent" label={`${CHANNEL[shown].name} · ${s.handle}${status[shown] !== "Live" ? ` · ${status[shown]}` : ""}`} labelClass="text-ink/60">
                <span className="font-semibold">{s.who}</span>{" "}
                <span className="text-ink/70">“<Highlight text={s.msg} part={s.highlight} on={on(2)} />”</span>
                <span className="mt-1.5 flex flex-wrap gap-1.5">
                  {s.extracted.map(([k, v], i) => (
                    <span
                      key={k}
                      className={cn("inline-flex items-center gap-1 rounded-md bg-black/[0.045] px-1.5 py-0.5 text-2xs font-medium text-ink/75 transition-all duration-500 ease-[cubic-bezier(0.22,1.2,0.36,1)]", on(2) ? "opacity-100 translate-y-0 scale-100" : "opacity-0 -translate-y-2 scale-90")}
                      style={{ transitionDelay: on(2) ? `${120 + i * 110}ms` : "0ms" }}
                    >
                      <span className="text-ink/60">{k}</span>
                      {v}
                    </span>
                  ))}
                </span>
              </Node>
              <Node on={on(2)} dot={cn("bg-ink", phase === 1 && !still && "animate-[dtBreathe_1.1s_ease-in-out_infinite]")} label="Daythread read" labelClass="text-ink/60">
                <span className="font-semibold">{s.ctx}</span>
                <span className="block text-xs text-ink/65">{s.ctxMeta}</span>
              </Node>
              <Node on={on(3)} dot="bg-ink/75" label="Your calendar" labelClass="text-ink/60">
                {s.action}
              </Node>
              <Node on={on(4)} dot="bg-success" label="Outcome" labelClass="text-ink/60">
                {s.outcome}
              </Node>
            </ol>
            <aside className="hidden md:flex lg:hidden xl:flex flex-col border-l border-border bg-paper/60 p-4">
              <div className="text-xs font-medium text-ink/60 mb-2">{s.who.split(" ")[0]}</div>
              <div className="text-xs text-ink/70 leading-relaxed">{s.ctx}</div>
              <div className="mt-auto pt-4">
                <div className={cn("rounded-2xl border px-3 py-2.5 transition-all duration-500", on(4) ? "border-border bg-white shadow-[0_1px_3px_rgba(16,17,20,0.06)] opacity-100 translate-y-0" : "border-border opacity-0 translate-y-1")}>
                  <div className="text-xs font-medium text-ink/60 mb-0.5">Next</div>
                  <div className="text-13 font-semibold text-ink leading-snug">{s.next}</div>
                  <div className="text-2xs text-ink/65 mt-0.5 leading-snug">{s.nextWhy}</div>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}

/** The phrase Daythread pulled the date/service from — it lights violet the moment the
 * system reads the message, so the chips below visibly come *from* the words. */
function Highlight({ text, part, on }: { text: string; part: string; on: boolean }) {
  const i = text.indexOf(part);
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <span className={cn("rounded-[4px] px-0.5 -mx-0.5 transition-colors duration-500", on ? "bg-black/[0.05] text-ink/70" : "bg-transparent")}>{part}</span>
      {text.slice(i + part.length)}
    </>
  );
}

function Node({ on, dot, label, labelClass, children }: { on: boolean; dot: string; label: string; labelClass: string; children: React.ReactNode }) {
  return (
    <li className={cn("relative py-2 transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]", on ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-2")}>
      <span aria-hidden className={cn("absolute -left-[26px] top-[13px] w-[15px] h-[15px] rounded-full border-[3px] border-white transition-transform duration-300", dot, on ? "scale-100" : "scale-0")} />
      <div className={cn("text-xs font-medium mb-0.5", labelClass)}>{label}</div>
      <div className="text-sm text-ink">{children}</div>
    </li>
  );
}
