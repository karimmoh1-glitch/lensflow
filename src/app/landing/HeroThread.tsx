"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { ChannelIcon, CHANNEL, type ChannelKey } from "./ChannelIcon";

/**
 * The hero: many inputs → one system → one result, told by the information itself.
 *
 * Every few seconds one channel lights up and its actual message — a chip with the words
 * in it — travels the connector into Daythread. The product responds in order: it reads
 * who this is (real lead extraction: service, date, intent), it acts (a booking or a
 * booking link), the outcome lands (a deposit, a confirmation), and the one thing left
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
    k: "instagram", who: "Maya Chen", handle: "@maya.makes", msg: "Hey! Are you free Tuesday afternoon?", highlight: "Tuesday afternoon",
    extracted: [["Date", "Tuesday PM"], ["Intent", "High"]], ctx: "Returning client · $2,150 lifetime", ctxMeta: "Booked twice · prefers afternoons",
    action: "Booked · Brand session · Tue 2:00 PM", outcome: "$105 deposit paid", next: "Send Maya the questionnaire", nextWhy: "Booked and paid. This is the one thing left.",
  },
  {
    k: "gmail", who: "Jordan Lee", handle: "jordan@northloop.co", msg: "Following up on pricing for a September date.", highlight: "September",
    extracted: [["Date", "September"], ["Intent", "Medium"]], ctx: "Warm lead · asked twice", ctxMeta: "First wrote 9 days ago",
    action: "Pricing sheet sent", outcome: "Follow-up set · 2 days", next: "Reply to Jordan", nextWhy: "Leads that wait 9 days usually go cold.",
  },
  {
    k: "sms", who: "(512) 555-0148", handle: "New number", msg: "Do you have anything open next week?", highlight: "next week",
    extracted: [["Date", "Next week"], ["Intent", "Medium"]], ctx: "New lead · contact created", ctxMeta: "Not in your clients until now",
    action: "Booking link sent", outcome: "Viewed · picking a time", next: "Nothing yet", nextWhy: "Daythread will tell you when they book.",
  },
  {
    k: "whatsapp", who: "Sam Okafor", handle: "+1 415 …", msg: "Can we move Thursday to 4pm?", highlight: "Thursday to 4pm",
    extracted: [["Date", "Thu 4:00 PM"], ["Intent", "High"]], ctx: "Client · booked Thursday", ctxMeta: "Consult · $180 · deposit paid",
    action: "Moved to 4:00 PM · confirmed", outcome: "Reminder rescheduled", next: "Nothing to do", nextWhy: "Sam got the confirmation on WhatsApp.",
  },
  {
    k: "website", who: "Priya Patel", handle: "Booking page", msg: "Booked the Full package for Sep 18.", highlight: "Full package",
    extracted: [["Service", "Full package"], ["Date", "Sep 18"]], ctx: "New client · $1,800", ctxMeta: "Came in through your booking page",
    action: "Confirmation + questionnaire sent", outcome: "$540 deposit paid", next: "Nothing to do", nextWhy: "Everything sent itself.",
  },
];

const PANEL_IN_Y = 150;
const gutterPath = (i: number) => `M 0 ${30 + i * 60} C 60 ${30 + i * 60}, 60 ${PANEL_IN_Y}, 120 ${PANEL_IN_Y}`;

export function HeroThread() {
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
    <div className="relative w-full select-none" aria-label="Messages from Instagram, Gmail, Messages, WhatsApp and your booking page flowing into one Daythread">
      {/* ambient: the active channel's color, softly, behind the product */}
      <div aria-hidden className="absolute -inset-10 rounded-[40px] blur-3xl transition-colors duration-700 pointer-events-none" style={{ background: `radial-gradient(60% 60% at 70% 50%, ${brand}22, transparent 70%)` }} />

      <div className="relative grid grid-cols-1 sm:grid-cols-[64px_120px_minmax(0,1fr)] items-center gap-y-5">
        {/* Channels */}
        <ul className="flex sm:flex-col justify-center gap-3 sm:gap-[4px]" role="tablist" aria-label="Channels" style={{ transform: "translate(calc(var(--mx) * 5px), calc(var(--my) * 4px))", transition: "transform 700ms cubic-bezier(0.16,1,0.3,1)" }}>
          {STORIES.map((st) => (
            <li key={st.k} className="sm:h-[60px] flex items-center justify-center">
              <button
                type="button"
                role="tab"
                aria-selected={st.k === active}
                aria-label={CHANNEL[st.k].name}
                onMouseEnter={() => pick(st.k)}
                onClick={() => pick(st.k)}
                className="rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2"
              >
                <ChannelIcon k={st.k} size={56} active={st.k === active} className={st.k === active ? "" : "opacity-75 hover:opacity-100"} />
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
                <stop offset="1" stopColor="#6D5AE6" />
              </linearGradient>
            </defs>
            {STORIES.map((st, i) => {
              const d = gutterPath(i);
              const isOn = st.k === active;
              const c = CHANNEL[st.k].brand === "#101114" ? "#6D5AE6" : CHANNEL[st.k].brand;
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
              className="dt-travel absolute left-0 top-0 max-w-[200px] rounded-xl bg-white border px-2.5 py-1.5 text-[11px] leading-tight text-ink shadow-popover whitespace-nowrap overflow-hidden text-ellipsis"
              style={{ offsetPath: `path("${gutterPath(idx)}")`, offsetRotate: "0deg", borderColor: `${brand}66` }}
            >
              {a.msg}
            </div>
          )}
        </div>

        {/* Daythread */}
        <div
          className={cn("relative rounded-[22px] border border-border bg-white overflow-hidden shadow-[0_32px_80px_-32px_rgba(16,17,20,0.35),0_2px_6px_rgba(16,17,20,0.05)]", phase === 1 && !still && "dt-pulse")}
          style={{ ["--dt-pulse" as string]: `${brand}55` }}
        >
          <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border bg-paper/70">
            <svg viewBox="0 0 24 24" className="w-4 h-4 text-ink" fill="none"><path d="M4 18C9 18 9 6 15 6C17 6 18.5 7.5 20 9" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" /></svg>
            <span className="text-[13px] font-extrabold tracking-tight text-ink">Daythread</span>
            <span className="text-[11px] text-ink/40">Inbox</span>
            <span className={cn("ml-auto text-[10px] font-bold rounded-full px-2 py-0.5 transition-colors", inFlight ? "bg-accent-soft text-accent-text" : phase < 4 ? "bg-signal-soft text-signal-text" : "bg-success-soft text-success-text")}>
              {inFlight ? "Incoming" : phase < 4 ? "Reading" : "Handled"}
            </span>
          </div>

          <div className={cn("grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_200px] lg:grid-cols-1 xl:grid-cols-[minmax(0,1fr)_200px] transition-opacity duration-500", inFlight ? "opacity-40" : "opacity-100")}>
            <ol className="relative pl-9 pr-4 py-4 min-h-[300px]">
              <span aria-hidden className="absolute left-[19px] top-4 bottom-4 w-px bg-border" />
              <span aria-hidden className="absolute left-[19px] top-4 w-px bg-gradient-to-b from-accent via-signal to-success origin-top transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]" style={{ height: "calc(100% - 2rem)", transform: `scaleY(${still || inFlight ? 1 : phase / 4})` }} />
              <Node on={on(1)} dot="bg-accent" label={`${CHANNEL[shown].name} · ${s.handle}`} labelClass="text-accent-text">
                <span className="font-semibold">{s.who}</span>{" "}
                <span className="text-ink/70">“<Highlight text={s.msg} part={s.highlight} on={on(2)} />”</span>
                <span className="mt-1.5 flex flex-wrap gap-1.5">
                  {s.extracted.map(([k, v], i) => (
                    <span
                      key={k}
                      className={cn("inline-flex items-center gap-1 rounded-md bg-signal-soft/70 px-1.5 py-0.5 text-[10px] font-semibold text-signal-text transition-all duration-500 ease-[cubic-bezier(0.22,1.2,0.36,1)]", on(2) ? "opacity-100 translate-y-0 scale-100" : "opacity-0 -translate-y-2 scale-90")}
                      style={{ transitionDelay: on(2) ? `${120 + i * 110}ms` : "0ms" }}
                    >
                      <span className="text-signal-text/60">{k}</span>
                      {v}
                    </span>
                  ))}
                </span>
              </Node>
              <Node on={on(2)} dot={cn("bg-signal", phase === 1 && !still && "animate-[dtBreathe_1.1s_ease-in-out_infinite]")} label="Daythread knows" labelClass="text-signal-text">
                <span className="font-semibold">{s.ctx}</span>
                <span className="block text-xs text-ink/60">{s.ctxMeta}</span>
              </Node>
              <Node on={on(3)} dot="bg-ink/75" label="Done for you" labelClass="text-ink/55">
                {s.action}
              </Node>
              <Node on={on(4)} dot="bg-success" label="Outcome" labelClass="text-success-text">
                {s.outcome}
              </Node>
            </ol>
            <aside className="hidden md:flex lg:hidden xl:flex flex-col border-l border-border bg-paper/60 p-4">
              <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink/45 mb-2">{s.who.split(" ")[0]}</div>
              <div className="text-xs text-ink/70 leading-relaxed">{s.ctx}</div>
              <div className="mt-auto pt-4">
                <div className={cn("rounded-2xl border px-3 py-2.5 transition-all duration-500", on(4) ? "border-accent/35 bg-gradient-to-br from-accent-soft/80 to-white opacity-100 translate-y-0" : "border-border opacity-0 translate-y-1")}>
                  <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-accent-text mb-0.5">Next</div>
                  <div className="text-[13px] font-semibold text-ink leading-snug">{s.next}</div>
                  <div className="text-[11px] text-ink/60 mt-0.5 leading-snug">{s.nextWhy}</div>
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
      <span className={cn("rounded-[4px] px-0.5 -mx-0.5 transition-colors duration-500", on ? "bg-signal-soft text-signal-text" : "bg-transparent")}>{part}</span>
      {text.slice(i + part.length)}
    </>
  );
}

function Node({ on, dot, label, labelClass, children }: { on: boolean; dot: string; label: string; labelClass: string; children: React.ReactNode }) {
  return (
    <li className={cn("relative py-2 transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]", on ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-2")}>
      <span aria-hidden className={cn("absolute -left-[26px] top-[13px] w-[15px] h-[15px] rounded-full border-[3px] border-white transition-transform duration-300", dot, on ? "scale-100" : "scale-0")} />
      <div className={cn("text-[10px] font-bold uppercase tracking-[0.12em] mb-0.5", labelClass)}>{label}</div>
      <div className="text-sm text-ink">{children}</div>
    </li>
  );
}
