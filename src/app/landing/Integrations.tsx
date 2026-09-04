"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { ChannelIcon, CHANNEL, type ChannelKey } from "./ChannelIcon";

/**
 * Every channel in, one answer out. Five channels the product actually connects, each
 * carrying a real message; one panel showing what Daythread makes of it. Select a channel
 * (it cycles on its own until you do) and the whole system responds: the connector lights
 * in that channel's color, the atmosphere tints to match, the panel pulses as the message
 * lands, and the result resolves into Daythread's own colors — signal, context, action.
 */
const ROWS: {
  k: ChannelKey; sender: string; handle: string; text: string;
  context: string; contextMeta: string; action: string; actionWhy: string; tag: string; tagTone: string;
}[] = [
  { k: "instagram", sender: "Maya Chen", handle: "@maya.makes", text: "Hey! Are you free Tuesday afternoon?", context: "Returning client · $2,150 lifetime", contextMeta: "Booked twice · prefers afternoons", action: "Offer Tuesday 2:00 PM", actionWhy: "Your only open afternoon this week", tag: "Returning", tagTone: "bg-signal-soft text-signal-text" },
  { k: "gmail", sender: "Jordan Lee", handle: "jordan@northloop.co", text: "Following up on pricing for a September date.", context: "Warm lead · asked twice", contextMeta: "First wrote 9 days ago · no reply yet", action: "Send the pricing sheet", actionWhy: "Leads that wait 9 days usually go cold", tag: "Follow-up", tagTone: "bg-accent-soft text-accent-text" },
  { k: "sms", sender: "(512) 555-0148", handle: "New number", text: "Do you have anything open next week?", context: "New lead · contact created", contextMeta: "Daythread made the client record", action: "Reply with your booking link", actionWhy: "New inquiries book most within the hour", tag: "New lead", tagTone: "bg-accent-soft text-accent-text" },
  { k: "whatsapp", sender: "Sam Okafor", handle: "WhatsApp", text: "Can we move Thursday to 4pm?", context: "Client · booked Thursday", contextMeta: "Consult · $180 · deposit paid", action: "Move it to 4:00 and confirm", actionWhy: "The slot is open. One tap.", tag: "Client", tagTone: "bg-success-soft text-success-text" },
  { k: "website", sender: "Priya Patel", handle: "Booking page", text: "Booked the Full package for Sep 18.", context: "New client · $1,800", contextMeta: "Deposit of $540 already paid", action: "Nothing — it handled itself", actionWhy: "Confirmation and questionnaire went out", tag: "Booked", tagTone: "bg-success-soft text-success-text" },
];

export function Integrations() {
  const [active, setActive] = useState<ChannelKey>("instagram");
  const [pulse, setPulse] = useState(0);
  const [reduced, setReduced] = useState(false);
  const touched = useRef(0);
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
            if (Date.now() - touched.current < 7000) return;
            setActive((cur) => ROWS[(ROWS.findIndex((r) => r.k === cur) + 1) % ROWS.length].k);
            setPulse((n) => n + 1);
          }, 3600);
        } else if (!entry.isIntersecting && timer) {
          clearInterval(timer);
          timer = undefined;
        }
      },
      { threshold: 0.35 }
    );
    io.observe(el);
    return () => {
      io.disconnect();
      if (timer) clearInterval(timer);
    };
  }, []);

  function pick(k: ChannelKey) {
    if (k === active) return;
    touched.current = Date.now();
    setActive(k);
    setPulse((n) => n + 1);
  }

  const c = ROWS.find((x) => x.k === active)!;
  const idx = ROWS.findIndex((x) => x.k === active);
  const brand = CHANNEL[active].brand;

  return (
    <div ref={ref} className="relative max-w-[1200px] mx-auto px-6">
      {/* atmosphere: the active channel's color, drifting behind the whole composition */}
      <div aria-hidden className="absolute inset-0 -z-0 pointer-events-none transition-all duration-1000" style={{ background: `radial-gradient(50% 60% at 72% 55%, ${brand}1f, transparent 70%)` }} />

      <div className="relative max-w-2xl mb-10 md:mb-14">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink/45 mb-4">Every channel</p>
        <h2 className="font-sans font-extrabold text-[clamp(2.4rem,5vw,4.25rem)] leading-[0.94] tracking-[-0.045em] text-ink text-balance">
          Every channel in.<br />One answer out.
        </h2>
      </div>

      <div className="relative grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_88px_minmax(0,1.15fr)] gap-6 lg:gap-0 items-stretch">
        {/* Channels — each one a real message */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3" role="tablist" aria-label="Connected channels">
          {ROWS.map((r) => {
            const on = r.k === active;
            return (
              <button
                key={r.k}
                role="tab"
                aria-selected={on}
                onClick={() => pick(r.k)}
                onMouseEnter={() => pick(r.k)}
                className={cn(
                  "group relative text-left rounded-[20px] border bg-white/90 backdrop-blur px-4 py-3.5 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
                  on ? "border-ink/15 shadow-[0_22px_44px_-22px_rgba(16,17,20,0.4)] -translate-y-0.5 scale-[1.01]" : "border-border hover:border-ink/15 hover:-translate-y-0.5"
                )}
                style={on ? { boxShadow: `0 22px 44px -22px rgba(16,17,20,0.4), inset 0 0 0 1px ${brand}33` } : undefined}
              >
                <div className="flex items-center gap-4">
                  <ChannelIcon k={r.k} size={52} active={on} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm font-extrabold text-ink">{CHANNEL[r.k].name}</span>
                      <span className="text-[11px] text-ink/45 truncate">{r.handle}</span>
                    </div>
                    <div className="text-sm text-ink mt-0.5 truncate"><span className="font-semibold">{r.sender}:</span> <span className="text-ink/70">{r.text}</span></div>
                  </div>
                  <span aria-hidden className={cn("w-2 h-2 rounded-full shrink-0 transition-transform duration-300", on ? "scale-100" : "scale-0")} style={{ background: brand }} />
                </div>
              </button>
            );
          })}
        </div>

        {/* Connector gutter (lg) — one thread from the active channel into the panel */}
        <div className="hidden lg:block relative">
          <svg className="absolute inset-0 w-full h-full" viewBox="0 0 88 420" preserveAspectRatio="none" fill="none" aria-hidden>
            <defs>
              <linearGradient id="dt-int-grad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stopColor={brand} />
                <stop offset="1" stopColor="#6D5AE6" />
              </linearGradient>
            </defs>
            {ROWS.map((r, i) => {
              const y = 42 + i * 84;
              const d = `M 0 ${y} C 44 ${y}, 44 210, 88 210`;
              const on = r.k === active;
              return (
                <g key={r.k}>
                  <path d={d} stroke="rgba(16,17,20,0.08)" strokeWidth="1.5" />
                  <path d={d} stroke="url(#dt-int-grad)" strokeWidth={on ? 2.5 : 0} strokeLinecap="round" className="transition-all duration-300" />
                  {on && !reduced && (
                    <circle key={pulse} r="4" fill={brand}>
                      <animateMotion dur="0.8s" begin="0s" fill="freeze" path={d} />
                      <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.1;0.8;1" dur="0.8s" fill="freeze" />
                    </circle>
                  )}
                </g>
              );
            })}
          </svg>
        </div>

        {/* The panel: what Daythread makes of it */}
        <div
          key={`${active}-${pulse}`}
          className={cn("relative rounded-[22px] border border-border bg-white shadow-[0_32px_80px_-32px_rgba(16,17,20,0.35)] overflow-hidden flex flex-col", !reduced && "dt-pulse")}
          style={{ ["--dt-pulse" as string]: `${brand}55` }}
        >
          <div className="flex items-center gap-2 px-5 py-3 border-b border-border bg-paper/70">
            <span className="w-2 h-2 rounded-full transition-colors duration-500" style={{ background: brand }} />
            <span className="text-sm font-extrabold text-ink tracking-tight">Daythread</span>
            <span className="ml-auto text-[11px] text-ink/50">Inbox · {idx + 1} of {ROWS.length}</span>
          </div>
          <div className="dt-swap p-5 flex-1">
            <ol className="relative pl-8">
              <span aria-hidden className="absolute left-[7px] top-3 bottom-3 w-px bg-border" />
              <li className="relative py-2.5">
                <span aria-hidden className="absolute -left-8 top-[13px] w-[15px] h-[15px] rounded-full border-[3px] border-white" style={{ background: brand }} />
                <div className="text-[10px] font-bold uppercase tracking-[0.12em] mb-1" style={{ color: brand === "#101114" ? "#5A5C66" : brand }}>Signal · {CHANNEL[c.k].name}</div>
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
                <div className="group flex items-center gap-3 rounded-2xl border border-accent/30 bg-gradient-to-br from-accent-soft/70 to-white px-4 py-3 transition-all duration-200 hover:border-accent/50 hover:-translate-y-px">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-ink">{c.action}</div>
                    <div className="text-xs text-ink/65">{c.actionWhy}</div>
                  </div>
                  <span className="text-xs font-bold text-accent-text shrink-0 transition-transform duration-200 group-hover:translate-x-0.5">Do it →</span>
                </div>
              </li>
            </ol>
          </div>
          {/* The composer — reply here, it goes out on their channel */}
          <div className="mt-auto px-5 pb-5">
            <div className="flex items-center gap-2 rounded-2xl border border-border bg-paper/70 px-3 py-2 transition-colors hover:border-ink/20">
              <ChannelIcon k={c.k} size={26} />
              <span className="flex-1 text-sm text-ink/40 truncate">Reply to {c.sender.split(" ")[0]} on {CHANNEL[c.k].name}…</span>
              <span className="inline-flex items-center h-8 px-3.5 rounded-full bg-ink text-white text-xs font-extrabold shrink-0">Send</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
