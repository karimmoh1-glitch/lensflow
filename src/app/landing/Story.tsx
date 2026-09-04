"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { ChannelIcon, CHANNEL, type ChannelKey } from "./ChannelIcon";

/**
 * The film. One pinned stage, driven entirely by scroll position — scroll fast and it
 * moves fast, scroll back and it rewinds, stop and it holds. Nothing waits for a timer.
 *
 * One object travels the whole story: Sarah's WhatsApp message.
 *
 *   CHAOS      six conversations from five places, scattered
 *   THREAD     they pull into one line — the thread — and their colors give way to it
 *   CONTEXT    Sarah's message steps forward; Daythread reads it: a booking request,
 *              from a returning client, and Friday 2:30 is open
 *   ACTION     the same card becomes the booking to send
 *   OUTCOME    booked, deposit paid
 *   PRODUCT    the thread widens into the application itself — inbox, client, booking,
 *              payment, automation — and Sarah's message is a row in it
 *
 * Illustrative, not a claim: Daythread does extract intent, dates and client context from
 * messages and lets you send a booking from the conversation; the person here is fiction.
 */
type Card = { k: ChannelKey; who: string; msg: string; when: string; from: { x: number; y: number; r: number }; line: number };

const CARDS: Card[] = [
  { k: "whatsapp", who: "Sarah Kim", msg: "Do you have anything Friday afternoon?", when: "now", from: { x: 44, y: 38, r: -4 }, line: 3 },
  { k: "instagram", who: "Maya Chen", msg: "Loved the last shoot — can we do another?", when: "2h", from: { x: 2, y: 4, r: -7 }, line: 1 },
  { k: "gmail", who: "Jordan Lee", msg: "Re: invoice for last month", when: "1d", from: { x: 50, y: 6, r: 5 }, line: 2 },
  { k: "sms", who: "(512) 555-0148", msg: "Anything open next week?", when: "3h", from: { x: 0, y: 46, r: 6 }, line: 4 },
  { k: "website", who: "Priya Patel", msg: "Booked the Full package · Sep 18", when: "1d", from: { x: 8, y: 74, r: -5 }, line: 5 },
  { k: "instagram", who: "Leo Studio", msg: "What do you charge for a half day?", when: "5h", from: { x: 52, y: 70, r: 8 }, line: 6 },
];
const FOCUS = 0;
const LINE_X = 11; // % of stage width — where the thread runs
const lineY = (i: number) => 12 + (i - 1) * 11; // % — node positions along the thread

const clamp = (v: number) => Math.max(0, Math.min(1, v));
const ease = (t: number) => 1 - Math.pow(1 - t, 3);
const seg = (p: number, a: number, b: number) => ease(clamp((p - a) / (b - a)));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

const BEATS = [
  { at: 0.0, eyebrow: "Right now", tone: "text-ink/45", title: <>Ten places.</>, sub: "Instagram. WhatsApp. Texts. Gmail. Your booking page." },
  { at: 0.16, eyebrow: "Daythread", tone: "text-signal-text", title: <>One thread.</>, sub: "Every conversation, in the order it happened." },
  { at: 0.34, eyebrow: "Context", tone: "text-signal-text", title: <>It reads it.</>, sub: "Who this is. What they want. What's open." },
  { at: 0.52, eyebrow: "Action", tone: "text-accent-text", title: <>It knows what&rsquo;s next.</>, sub: "The booking, ready to send." },
  { at: 0.66, eyebrow: "Outcome", tone: "text-success-text", title: <>Done.</>, sub: "Booked. Deposit paid. Nothing to chase." },
  { at: 0.8, eyebrow: "The product", tone: "text-ink/45", title: <>This is Daythread.</>, sub: "The thread is the interface." },
];

export function Story() {
  const ref = useRef<HTMLElement>(null);
  const [p, setP] = useState(0);
  const [pinned, setPinned] = useState(true);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setPinned(false);
      setP(1);
      return;
    }
    const el = ref.current;
    if (!el) return;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        const range = r.height - window.innerHeight;
        setP(clamp(-r.top / Math.max(range, 1)));
        ticking = false;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  // Phase progress
  const gather = seg(p, 0.08, 0.28);
  const thread = seg(p, 0.14, 0.3);
  const focus = seg(p, 0.32, 0.46);
  const chip1 = seg(p, 0.38, 0.43);
  const chip2 = seg(p, 0.43, 0.48);
  const chip3 = seg(p, 0.48, 0.53);
  const action = seg(p, 0.54, 0.62);
  const outcome = seg(p, 0.68, 0.76);
  const product = seg(p, 0.8, 0.92);
  const settle = seg(p, 0.9, 1.0);

  const beat = p < 0.14 ? 0 : p < 0.33 ? 1 : p < 0.53 ? 2 : p < 0.67 ? 3 : p < 0.8 ? 4 : 5;

  // Atmosphere: channel colors → violet → paper
  const chaosTint = 1 - gather;
  const violetTint = mix(0, 1, thread) * (1 - product);

  return (
    <section ref={ref} className={cn("relative", pinned ? "h-[520vh]" : "py-16")} aria-label="One message, from chaos to booked, and the product it lives in">
      <div className={cn("w-full", pinned && "sticky top-0 h-[100svh] flex items-center overflow-hidden")}>
        {/* atmosphere */}
        <div aria-hidden className="absolute inset-0 pointer-events-none transition-opacity duration-300" style={{ opacity: chaosTint * 0.9, background: "radial-gradient(40% 40% at 20% 30%, rgba(214,41,118,0.10), transparent 70%), radial-gradient(40% 40% at 80% 25%, rgba(234,67,53,0.10), transparent 70%), radial-gradient(45% 45% at 70% 80%, rgba(37,211,102,0.12), transparent 70%)" }} />
        <div aria-hidden className="absolute inset-0 pointer-events-none" style={{ opacity: violetTint * 0.8, background: "radial-gradient(50% 50% at 60% 50%, rgba(109,90,230,0.14), transparent 70%)" }} />

        <div className="relative max-w-[1200px] mx-auto px-6 w-full grid grid-cols-1 lg:grid-cols-[minmax(0,0.72fr)_minmax(0,1.28fr)] gap-6 lg:gap-16 items-center">
          {/* Beats */}
          <div className="relative h-[120px] sm:h-[150px] lg:h-[260px]">
            {BEATS.map((b, i) => {
              const on = beat === i;
              return (
                <div key={i} className="absolute inset-0 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]" style={{ opacity: on ? 1 : 0, transform: `translateY(${on ? 0 : beat > i ? -10 : 10}px)` }} aria-hidden={!on}>
                  <p className={cn("text-[11px] font-bold uppercase tracking-[0.16em] mb-2 lg:mb-4", b.tone)}>{b.eyebrow}</p>
                  <h2 className="font-sans font-extrabold text-[clamp(2rem,4.6vw,4rem)] leading-[0.94] tracking-[-0.045em] text-ink">{b.title}</h2>
                  <p className="mt-2 lg:mt-4 text-sm lg:text-base text-ink/55 max-w-xs">{b.sub}</p>
                </div>
              );
            })}
          </div>

          {/* Stage */}
          <div className="relative w-full max-w-[600px] mx-auto lg:mx-0 aspect-[600/520] select-none">
            {/* the thread */}
            <div aria-hidden className="absolute top-[6%] bottom-[8%] w-px bg-ink/10" style={{ left: `${LINE_X}%` }} />
            <div aria-hidden className="absolute top-[6%] w-px bg-gradient-to-b from-accent via-signal to-success origin-top" style={{ left: `${LINE_X}%`, height: "86%", transform: `scaleY(${thread})`, opacity: 1 - product }} />

            {/* the product frame, growing out of the thread */}
            <div
              aria-hidden={product === 0}
              className="absolute inset-0 rounded-[22px] border border-border bg-white shadow-[0_40px_100px_-40px_rgba(16,17,20,0.4)] overflow-hidden"
              style={{ transformOrigin: `${LINE_X}% 50%`, transform: `scaleX(${mix(0.004, 1, product)})`, opacity: product > 0.02 ? 1 : 0 }}
            >
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-paper/70" style={{ opacity: settle }}>
                <svg viewBox="0 0 24 24" className="w-4 h-4 text-ink" fill="none"><path d="M4 18C9 18 9 6 15 6C17 6 18.5 7.5 20 9" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" /></svg>
                <span className="text-[13px] font-extrabold tracking-tight text-ink">Daythread</span>
                <span className="text-[11px] text-ink/40">Inbox</span>
                <span className="ml-auto text-[10px] font-bold rounded-full px-2 py-0.5 bg-success-soft text-success-text">Handled</span>
              </div>
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] h-[calc(100%-42px)]">
                {/* Inbox */}
                <Panel k={0} t={settle} className="border-r border-border">
                  <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-ink/45">Inbox · sorted by what needs you</div>
                  <Row k="whatsapp" who="Sarah Kim" msg="Do you have anything Friday afternoon?" tag="Booked" tagTone="text-success-text" active />
                  <Row k="instagram" who="Maya Chen" msg="Loved the last shoot — can we do another?" tag="Needs reply" tagTone="text-accent-text" />
                  <Row k="gmail" who="Jordan Lee" msg="Re: invoice for last month" tag="Balance due" tagTone="text-warning-text" />
                  <Row k="sms" who="(512) 555-0148" msg="Anything open next week?" tag="Link sent" tagTone="text-signal-text" />
                  <Row k="website" who="Priya Patel" msg="Booked the Full package · Sep 18" tag="Deposit paid" tagTone="text-success-text" />
                  <Row k="instagram" who="Leo Studio" msg="What do you charge for a half day?" tag="Needs reply" tagTone="text-accent-text" />
                </Panel>
                {/* Client / booking / payment / automation */}
                <div className="flex flex-col divide-y divide-border bg-paper/40">
                  <Panel k={1} t={settle} className="px-3 py-2.5">
                    <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink/45 mb-1">Client</div>
                    <div className="flex items-center gap-2"><span className="w-7 h-7 rounded-full bg-success-soft text-success-text text-[10px] font-extrabold flex items-center justify-center">SK</span><div className="min-w-0"><div className="text-xs font-semibold text-ink truncate">Sarah Kim</div><div className="text-[10px] text-ink/55">Returning · 2 bookings · $700</div></div></div>
                  </Panel>
                  <Panel k={2} t={settle} className="px-3 py-2.5">
                    <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink/45 mb-1">Booking</div>
                    <div className="text-xs font-semibold text-ink">Brand session · Fri 2:30 PM</div>
                    <div className="text-[10px] text-ink/55">$350 · questionnaire sent</div>
                  </Panel>
                  <Panel k={3} t={settle} className="px-3 py-2.5">
                    <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink/45 mb-1">Payment</div>
                    <div className="flex items-center justify-between text-xs"><span className="font-semibold text-ink">Deposit · $105</span><span className="text-[10px] font-bold rounded-full px-1.5 py-0.5 bg-success-soft text-success-text">Paid</span></div>
                  </Panel>
                  <Panel k={4} t={settle} className="px-3 py-2.5 flex-1">
                    <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink/45 mb-1">Automation</div>
                    <div className="text-[11px] text-ink/75 leading-snug"><span className="text-accent-text font-bold">When</span> a booking is coming up · <span className="text-signal-text font-bold">if</span> 1 day before · <span className="text-success-text font-bold">then</span> send a reminder</div>
                  </Panel>
                </div>
              </div>
            </div>

            {/* the conversations — positioned in % of the stage so the same geometry works at every width */}
            {CARDS.map((c, i) => {
              const isFocus = i === FOCUS;
              const brand = CHANNEL[c.k].brand;
              // chaos → the thread
              let x = mix(c.from.x, LINE_X + 3.5, gather);
              let y = mix(c.from.y, lineY(c.line) - 3, gather);
              const r = c.from.r * (1 - gather);
              let w = mix(46, 58, gather);
              let scale = 1;
              let op = 1;
              if (isFocus) {
                // step forward and grow; hand off to the inbox row when the product arrives
                x = mix(x, 24, focus);
                y = mix(y, 16, focus);
                w = mix(w, 66, focus);
                scale = mix(1, 1.02, focus);
                op = 1 - seg(p, 0.8, 0.86);
              } else {
                // recede into the thread as its nodes
                x = mix(x, LINE_X - 1.5, focus);
                scale = mix(1, 0.22, focus);
                op = mix(1, 0.4, focus) * (1 - product);
              }
              // channel color on the border while scattered; the thread's neutral once gathered
              const alpha = Math.round(mix(0x88, 0x1a, gather)).toString(16).padStart(2, "0");
              const cardTone = isFocus ? (outcome > 0.5 ? "rgba(30,142,90,0.45)" : action > 0.5 ? "rgba(16,17,20,0.35)" : focus > 0.5 ? "rgba(109,90,230,0.45)" : `${brand}${alpha}`) : `${brand}${alpha}`;
              return (
                <div
                  key={i}
                  className={cn("absolute will-change-transform", p < 0.06 && "dt-drift")}
                  style={{ left: `${x}%`, top: `${y}%`, width: `${w}%`, transform: `rotate(${r}deg) scale(${scale})`, transformOrigin: isFocus ? "top left" : "left center", opacity: op, animationDelay: `${i * 0.45}s`, zIndex: isFocus ? 3 : 2 }}
                >
                  <div className="rounded-2xl border bg-white shadow-popover overflow-hidden transition-[border-color] duration-300" style={{ borderColor: cardTone }}>
                    <div className="flex items-center gap-2.5 px-3 py-2.5">
                      <ChannelIcon k={c.k} size={30} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-1.5"><span className="text-xs font-semibold text-ink truncate">{c.who}</span><span className="text-[10px] text-ink/40 shrink-0">{c.when}</span></div>
                        <div className="text-[11px] text-ink/70 truncate">{c.msg}</div>
                      </div>
                    </div>
                    {isFocus && (
                      <div className="relative">
                        {/* CONTEXT: what Daythread read — the card grows one line at a time */}
                        <div className="px-3 space-y-1.5 overflow-hidden" style={{ opacity: 1 - clamp(action * 2.5), maxHeight: (chip1 * 24 + chip2 * 24 + chip3 * 24 + (chip1 > 0 ? 12 : 0)) * (1 - action) }}>
                          <Chip t={chip1} dot="bg-signal" label="Intent" value="Booking request" />
                          <Chip t={chip2} dot="bg-signal" label="Client" value="Sarah Kim · returning · 2 bookings" />
                          <Chip t={chip3} dot="bg-signal" label="Open" value="Friday 2:30 PM" />
                        </div>
                        {/* ACTION → OUTCOME: the same card, now the booking */}
                        <div className="px-3 overflow-hidden" style={{ opacity: action, maxHeight: action * 132, paddingBottom: action * 12, transform: `translateY(${(1 - action) * 6}px)` }}>
                          <div className={cn("rounded-xl border px-3 py-2.5 transition-colors duration-500", outcome > 0.5 ? "border-success/30 bg-success-soft/40" : "border-accent/30 bg-gradient-to-br from-accent-soft/70 to-white")}>
                            <div className={cn("text-[10px] font-bold uppercase tracking-[0.12em] mb-0.5 transition-colors", outcome > 0.5 ? "text-success-text" : "text-accent-text")}>{outcome > 0.5 ? "Booked" : "Send booking"}</div>
                            <div className="text-sm font-extrabold text-ink tracking-tight">Brand session · Fri 2:30 PM</div>
                            <div className="flex items-center justify-between mt-1.5">
                              <span className="text-[11px] text-ink/60">$350 · 30% deposit</span>
                              <span className={cn("inline-flex items-center h-7 px-3 rounded-full text-[11px] font-extrabold transition-colors duration-500", outcome > 0.5 ? "bg-success text-white" : "bg-accent text-white")}>{outcome > 0.5 ? "$105 paid" : "Send →"}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

function Chip({ t, dot, label, value }: { t: number; dot: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 text-[11px]" style={{ opacity: t, transform: `translateX(${(1 - t) * -6}px)` }}>
      <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", dot)} />
      <span className="text-ink/45 font-bold uppercase tracking-[0.1em] text-[9px] w-10 shrink-0">{label}</span>
      <span className="font-semibold text-ink truncate">{value}</span>
    </div>
  );
}

function Panel({ k, t, className, children }: { k: number; t: number; className?: string; children: React.ReactNode }) {
  const local = clamp((t - k * 0.12) / 0.5);
  return (
    <div className={cn("min-w-0", className)} style={{ opacity: local, transform: `translateX(${(1 - local) * -10}px)` }}>
      {children}
    </div>
  );
}

function Row({ k, who, msg, tag, tagTone, active }: { k: ChannelKey; who: string; msg: string; tag: string; tagTone: string; active?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2.5 px-3 py-2 border-t border-border", active && "bg-success-soft/30")}>
      <ChannelIcon k={k} size={26} />
      <div className="min-w-0 flex-1">
        <div className="text-xs font-semibold text-ink truncate">{who}</div>
        <div className="text-[10px] text-ink/60 truncate">{msg}</div>
      </div>
      <span className={cn("text-[9px] font-bold shrink-0", tagTone)}>{tag}</span>
    </div>
  );
}
