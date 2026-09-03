"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * The integrations moment. Not logos in a row: four channels the visitor uses every day,
 * unmistakable, each carrying a real message — and one panel showing what Daythread makes
 * of it. Select a channel (it also cycles on its own until you do) and the message
 * travels the connector into the panel, where it becomes a person, a value, and an action.
 */
type Key = "instagram" | "gmail" | "sms" | "messenger";

function IgGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="w-7 h-7" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="5.5" stroke="white" strokeWidth="1.9" />
      <circle cx="12" cy="12" r="4.2" stroke="white" strokeWidth="1.9" />
      <circle cx="17.2" cy="6.8" r="1.2" fill="white" />
    </svg>
  );
}
function GmailGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="w-7 h-7" aria-hidden>
      <rect x="3" y="5" width="18" height="14" rx="2.5" stroke="white" strokeWidth="1.9" />
      <path d="M4 6.5L12 13L20 6.5" stroke="white" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function SmsGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="w-7 h-7" aria-hidden>
      <path d="M4 5.5C4 4.7 4.7 4 5.5 4h13c.8 0 1.5.7 1.5 1.5v9c0 .8-.7 1.5-1.5 1.5H9l-4 3.5V16h-.5C3.7 16 3 15.3 3 14.5v-9z" fill="white" />
    </svg>
  );
}
function MessengerGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="w-7 h-7" aria-hidden>
      <path d="M12 3.5C6.75 3.5 2.5 7.34 2.5 12.06c0 2.64 1.35 5 3.46 6.55.18.13.3.34.3.57l.06 1.83a.72.72 0 0 0 1.01.65l2.04-.9a1 1 0 0 1 .68-.04c.6.16 1.24.24 1.95.24 5.25 0 9.5-3.84 9.5-8.9S17.25 3.5 12 3.5Z" fill="white" />
    </svg>
  );
}

const CHANNELS: {
  key: Key;
  name: string;
  bg: string;
  brand: string;
  glyph: () => React.ReactNode;
  sender: string;
  handle: string;
  text: string;
  context: string;
  contextMeta: string;
  action: string;
  actionWhy: string;
  tag: string;
  tagTone: string;
}[] = [
  {
    key: "instagram", name: "Instagram", bg: "bg-gradient-to-br from-[#FEDA75] via-[#D62976] to-[#4F5BD5]", brand: "#D62976", glyph: IgGlyph,
    sender: "Maya Chen", handle: "@maya.makes", text: "Hey! Are you free Tuesday afternoon?",
    context: "Returning client · $2,150 lifetime", contextMeta: "Booked twice · prefers afternoons",
    action: "Offer Tuesday 2:00 PM", actionWhy: "Your only open afternoon slot this week", tag: "Returning", tagTone: "bg-signal-soft text-signal-text",
  },
  {
    key: "gmail", name: "Gmail", bg: "bg-[#EA4335]", brand: "#EA4335", glyph: GmailGlyph,
    sender: "Jordan Lee", handle: "jordan@northloop.co", text: "Following up on pricing for a September date.",
    context: "Warm lead · asked twice", contextMeta: "First wrote 9 days ago · no reply yet",
    action: "Send the pricing sheet", actionWhy: "Leads that wait 9 days usually go cold", tag: "Follow-up", tagTone: "bg-accent-soft text-accent-text",
  },
  {
    key: "sms", name: "SMS", bg: "bg-[#2FC26E]", brand: "#2FC26E", glyph: SmsGlyph,
    sender: "(512) 555-0148", handle: "New number", text: "Do you have anything open next week?",
    context: "New lead · not in your clients yet", contextMeta: "Daythread created the contact",
    action: "Reply with your booking link", actionWhy: "New inquiries book 3× more often within an hour", tag: "New lead", tagTone: "bg-accent-soft text-accent-text",
  },
  {
    key: "messenger", name: "Messenger", bg: "bg-gradient-to-br from-[#00B2FF] to-[#8134F5]", brand: "#8134F5", glyph: MessengerGlyph,
    sender: "Priya Patel", handle: "Messenger", text: "Loved the preview! Can we book the full package?",
    context: "Client · balance of $175 still open", contextMeta: "Full package is $1,800",
    action: "Send a booking for the full package", actionWhy: "She said yes. Make it easy.", tag: "Ready to book", tagTone: "bg-success-soft text-success-text",
  },
];

export function Integrations() {
  const [active, setActive] = useState<Key>("instagram");
  const [pulse, setPulse] = useState(0);
  const [reduced, setReduced] = useState(false);
  const touched = useRef(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setReduced(true);
      return;
    }
    const el = ref.current;
    if (!el) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !timer) {
          timer = setInterval(() => {
            if (touched.current) return;
            setActive((cur) => {
              const i = CHANNELS.findIndex((c) => c.key === cur);
              return CHANNELS[(i + 1) % CHANNELS.length].key;
            });
            setPulse((n) => n + 1);
          }, 3400);
        } else if (!entry.isIntersecting && timer) {
          clearInterval(timer);
          timer = undefined;
        }
      },
      { threshold: 0.4 }
    );
    io.observe(el);
    return () => {
      io.disconnect();
      if (timer) clearInterval(timer);
    };
  }, []);

  function pick(k: Key) {
    touched.current = true;
    setActive(k);
    setPulse((n) => n + 1);
  }

  const c = CHANNELS.find((x) => x.key === active)!;
  const idx = CHANNELS.findIndex((x) => x.key === active);

  return (
    <div ref={ref} className="max-w-6xl mx-auto px-6">
      <div className="max-w-2xl mb-12 md:mb-16">
        <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-ink/45 mb-4">Integrations</p>
        <h2 className="font-sans font-extrabold text-[clamp(2.2rem,5vw,4rem)] leading-[0.96] tracking-[-0.04em] text-ink text-balance">
          Every channel in. One answer out.
        </h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_72px_minmax(0,1.1fr)] gap-6 lg:gap-0 items-stretch">
        {/* Channels */}
        <div className="grid grid-cols-2 lg:grid-cols-1 gap-3" role="tablist" aria-label="Connected channels">
          {CHANNELS.map((ch) => {
            const on = ch.key === active;
            return (
              <button
                key={ch.key}
                role="tab"
                aria-selected={on}
                onClick={() => pick(ch.key)}
                onMouseEnter={() => pick(ch.key)}
                className={cn(
                  "group relative text-left rounded-2xl border bg-white p-4 lg:p-5 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
                  on ? "border-ink/20 shadow-[0_18px_40px_-20px_rgba(16,17,20,0.35)] -translate-y-0.5" : "border-border hover:border-ink/15 hover:-translate-y-0.5"
                )}
              >
                <div className="flex items-center gap-3 lg:gap-4">
                  <span className={cn("w-12 h-12 lg:w-14 lg:h-14 rounded-2xl flex items-center justify-center shrink-0 transition-transform duration-300", ch.bg, on && "scale-105")} style={{ boxShadow: on ? `0 10px 24px -10px ${ch.brand}` : undefined }}>
                    <ch.glyph />
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-extrabold text-ink">{ch.name}</span>
                      <span className="hidden sm:inline text-[11px] text-ink/45 truncate">{ch.handle}</span>
                    </div>
                    <div className="text-sm text-ink mt-0.5 truncate"><span className="font-semibold">{ch.sender}:</span> <span className="text-ink/70">{ch.text}</span></div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Connector gutter (desktop) — one thread from the active channel into the panel */}
        <div className="hidden lg:block relative">
          <svg className="absolute inset-0 w-full h-full" viewBox="0 0 72 400" preserveAspectRatio="none" fill="none" aria-hidden>
            <defs>
              <linearGradient id="dt-int-grad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stopColor={c.brand} />
                <stop offset="1" stopColor="#6D5AE6" />
              </linearGradient>
            </defs>
            {CHANNELS.map((ch, i) => {
              const y = 50 + i * 100;
              const d = `M 0 ${y} C 36 ${y}, 36 200, 72 200`;
              const on = ch.key === active;
              return (
                <g key={ch.key}>
                  <path d={d} stroke="rgba(16,17,20,0.08)" strokeWidth="1.5" />
                  <path d={d} stroke="url(#dt-int-grad)" strokeWidth={on ? 2.5 : 0} strokeLinecap="round" className="transition-all duration-300" />
                  {on && !reduced && (
                    <circle key={pulse} r="3.5" fill={ch.brand}>
                      <animateMotion dur="0.9s" begin="0s" fill="freeze" path={d} />
                      <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.1;0.8;1" dur="0.9s" fill="freeze" />
                    </circle>
                  )}
                </g>
              );
            })}
          </svg>
        </div>

        {/* The panel: what Daythread makes of it */}
        <div className="rounded-[20px] border border-border bg-white shadow-[0_24px_64px_-24px_rgba(16,17,20,0.25)] overflow-hidden flex flex-col">
          <div className="flex items-center gap-2 px-5 py-3 border-b border-border bg-paper/70">
            <span className="w-2 h-2 rounded-full bg-signal" />
            <span className="text-sm font-extrabold text-ink tracking-tight">Daythread</span>
            <span className="ml-auto text-[11px] text-ink/50">Inbox · {idx + 1} of 4</span>
          </div>
          <div key={active} className="p-5 flex-1 animate-[fadeUp_0.35s_cubic-bezier(0.16,1,0.3,1)]">
            <ol className="relative pl-8">
              <span aria-hidden className="absolute left-[7px] top-3 bottom-3 w-px bg-border" />
              <li className="relative py-2.5">
                <span aria-hidden className="absolute -left-8 top-[13px] w-[15px] h-[15px] rounded-full border-[3px] border-white bg-accent" />
                <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-accent-text mb-1">Signal · {c.name}</div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-ink">{c.sender}</span>
                  <span className={cn("text-[10px] font-bold rounded-full px-2 py-0.5", c.tagTone)}>{c.tag}</span>
                </div>
                <div className="text-sm text-ink/75 mt-0.5">“{c.text}”</div>
              </li>
              <li className="relative py-2.5">
                <span aria-hidden className="absolute -left-8 top-[13px] w-[15px] h-[15px] rounded-full border-[3px] border-white bg-signal" />
                <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-signal-text mb-1">Context · Daythread knows</div>
                <div className="text-sm font-semibold text-ink">{c.context}</div>
                <div className="text-xs text-ink/60 mt-0.5">{c.contextMeta}</div>
              </li>
              <li className="relative py-2.5">
                <span aria-hidden className="absolute -left-8 top-[13px] w-[15px] h-[15px] rounded-full border-[3px] border-white bg-ink/75" />
                <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink/55 mb-1">Action · what to do</div>
                <div className="flex items-center gap-3 rounded-2xl border border-accent/30 bg-gradient-to-br from-accent-soft/70 to-transparent px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-ink">{c.action}</div>
                    <div className="text-xs text-ink/65">{c.actionWhy}</div>
                  </div>
                  <span className="text-xs font-bold text-accent-text shrink-0">Do it →</span>
                </div>
              </li>
            </ol>
          </div>
          <div className="px-5 py-3 border-t border-border bg-paper/60 text-[11px] text-ink/55">
            Reply here. It goes out on their channel.
          </div>
        </div>
      </div>
    </div>
  );
}
