"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * The flagship visual moment of the landing page: four real channels — Instagram,
 * Messenger, Gmail, SMS — each with an authentic message surface, converging through
 * glowing animated connectors into a single, substantial Daythread workspace that visibly
 * organizes what arrives (a conversation, a lead tag, an estimated value). The intro plays
 * once as a ~3s choreographed sequence when the section scrolls into view, then the whole
 * thing stays interactive: hovering or clicking any channel replays its connector and
 * re-highlights its result, so a visitor can explore it like a miniature product demo.
 *
 * Deliberate choice over true scroll-scrubbing: a pinned, scroll-position-driven version
 * of this was tried earlier in this project (see git history on WorkspaceAssembly) and
 * dropped for reliability — a timed sequence triggered once on scroll-into-view gets the
 * same cinematic narrative without that fragility.
 *
 * The initial (pre-animation, pre-hydration) render is a fully composed, dimmed version of
 * the finished layout — not blank space that pops content in. Every element that will
 * eventually animate is already present and legible on the very first paint; animation
 * only brightens/settles it. That's what actually fixes "looks sparse for a moment," as
 * opposed to just extending the reveal timing.
 */

type ChannelKey = "instagram" | "gmail" | "sms" | "messenger";

function InstagramGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="5.5" stroke="white" strokeWidth="1.75" />
      <circle cx="12" cy="12" r="4.2" stroke="white" strokeWidth="1.75" />
      <circle cx="17.2" cy="6.8" r="1.1" fill="white" />
    </svg>
  );
}

function GmailGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <rect x="3" y="5" width="18" height="14" rx="2.5" stroke="white" strokeWidth="1.75" />
      <path d="M4 6.5L12 13L20 6.5" stroke="white" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SmsGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path d="M4 5.5C4 4.7 4.7 4 5.5 4h13c.8 0 1.5.7 1.5 1.5v9c0 .8-.7 1.5-1.5 1.5H9l-4 3.5V16h-.5C3.7 16 3 15.3 3 14.5v-9z" fill="white" />
    </svg>
  );
}

function MessengerGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M12 3.5C6.75 3.5 2.5 7.34 2.5 12.06c0 2.64 1.35 5 3.46 6.55.18.13.3.34.3.57l.06 1.83a.72.72 0 0 0 1.01.65l2.04-.9a1 1 0 0 1 .68-.04c.6.16 1.24.24 1.95.24 5.25 0 9.5-3.84 9.5-8.9S17.25 3.5 12 3.5Z"
        fill="white"
      />
    </svg>
  );
}

const CHANNELS: {
  key: ChannelKey;
  label: string;
  meta: string;
  sender: string;
  text: string;
  glyph: typeof InstagramGlyph;
  iconClass: string;
  brand: string;
  tint: string;
  border: string;
  resultTag: string;
  resultTone: "accent" | "info" | "success";
  value: number;
}[] = [
  {
    key: "instagram",
    label: "Instagram",
    meta: "Instagram · DM",
    sender: "Sarah Johnson",
    text: "Hey! Are you available next Saturday?",
    glyph: InstagramGlyph,
    iconClass: "bg-gradient-to-br from-[#FEDA75] via-[#D62976] to-[#4F5BD5]",
    brand: "#D62976",
    tint: "bg-[#D62976]/[0.05]",
    border: "border-[#D62976]/25",
    resultTag: "New lead",
    resultTone: "accent",
    value: 2400,
  },
  {
    key: "gmail",
    label: "Gmail",
    meta: "priya.patel@gmail.com",
    sender: "Priya Patel",
    text: "Following up on pricing for a September date.",
    glyph: GmailGlyph,
    iconClass: "bg-[#EA4335]",
    brand: "#EA4335",
    tint: "bg-[#EA4335]/[0.05]",
    border: "border-[#EA4335]/25",
    resultTag: "Follow-up",
    resultTone: "info",
    value: 1200,
  },
  {
    key: "sms",
    label: "SMS",
    meta: "(512) 555-0148",
    sender: "(512) 555-0148",
    text: "Do you have anything open next week?",
    glyph: SmsGlyph,
    iconClass: "bg-[#2FC26E]",
    brand: "#2FC26E",
    tint: "bg-[#2FC26E]/[0.05]",
    border: "border-[#2FC26E]/25",
    resultTag: "New lead",
    resultTone: "accent",
    value: 650,
  },
  {
    key: "messenger",
    label: "Messenger",
    meta: "Messenger",
    sender: "Alex Rivera",
    text: "Loved the preview! Can we book the full session?",
    glyph: MessengerGlyph,
    iconClass: "bg-gradient-to-br from-[#00B2FF] to-[#8134F5]",
    brand: "#8134F5",
    tint: "bg-[#8134F5]/[0.05]",
    border: "border-[#8134F5]/25",
    resultTag: "Ready to book",
    resultTone: "success",
    value: 1800,
  },
];

// A 100x140 gutter: four sources on the left converging on one anchor near the workspace.
const ANCHOR: [number, number] = [68, 62];
const SOURCE_Y: Record<ChannelKey, number> = { instagram: 14, gmail: 46, sms: 78, messenger: 110 };

function connectorPath(key: ChannelKey): string {
  const y = SOURCE_Y[key];
  const [ax, ay] = ANCHOR;
  const midY = y + (ay - y) * 0.35;
  return `M 8 ${y} C 34 ${y}, 46 ${midY}, ${ax} ${ay}`;
}

const TONE_CLASSES: Record<string, string> = {
  accent: "bg-accent-soft text-accent-text",
  info: "bg-info-soft text-info-text",
  success: "bg-success-soft text-success-text",
};

export function IntegrationShowcase() {
  const [visible, setVisible] = useState(false);
  const [arrived, setArrived] = useState<Set<ChannelKey>>(new Set());
  const [justArrived, setJustArrived] = useState<ChannelKey | null>(null);
  const [active, setActive] = useState<ChannelKey | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const sequenceDone = arrived.size === CHANNELS.length;

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setReducedMotion(reduced);
    if (reduced) {
      setVisible(true);
      setArrived(new Set(CHANNELS.map((c) => c.key)));
      return;
    }
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          CHANNELS.forEach((c, i) => {
            setTimeout(() => {
              setArrived((prev) => new Set(prev).add(c.key));
              setActive(c.key);
              setJustArrived(c.key);
              setTimeout(() => setJustArrived((cur) => (cur === c.key ? null : cur)), 1000);
            }, 500 + i * 650);
          });
          observer.disconnect();
        }
      },
      { threshold: 0.3 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  function replay(key: ChannelKey) {
    if (!sequenceDone) return;
    setActive(key);
    setJustArrived(key);
    setTimeout(() => setJustArrived((cur) => (cur === key ? null : cur)), 1000);
  }

  const totalValue = [...arrived].reduce((sum, key) => sum + (CHANNELS.find((c) => c.key === key)?.value ?? 0), 0);

  return (
    <div ref={containerRef} className="relative max-w-5xl mx-auto px-6">
      {/* Atmospheric background — two restrained brand-color blooms, not a rainbow wash */}
      <div
        className="absolute -left-20 top-10 w-[420px] h-[420px] rounded-full opacity-[0.10] blur-3xl pointer-events-none"
        style={{ background: "radial-gradient(circle, #F0524D 0%, transparent 70%)" }}
        aria-hidden
      />
      <div
        className="absolute right-0 top-1/3 w-[480px] h-[480px] rounded-full opacity-[0.14] blur-3xl pointer-events-none"
        style={{ background: "radial-gradient(circle, #6D5AE6 0%, transparent 70%)" }}
        aria-hidden
      />

      <div className="relative text-center max-w-lg mx-auto mb-14">
        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-signal-text mb-3">How it works</div>
        <h2 className="font-sans font-black text-3xl md:text-[2.75rem] leading-[1.02] tracking-tight text-ink">
          Chaos comes in. <span className="text-accent-text">Work</span> comes out.
        </h2>
        <p className="mt-4 text-ink/55 text-sm md:text-base max-w-md mx-auto">
          Instagram, Messenger, Gmail, and SMS — every channel your clients already use, flowing into one organized workspace.
        </p>
      </div>

      {/* Desktop / tablet: channels, connectors, workspace */}
      <div className="hidden md:grid relative grid-cols-[1fr_88px_1.15fr] gap-0 items-center">
        <div className="flex flex-col gap-4">
          {CHANNELS.map((c) => {
            const hasArrived = arrived.has(c.key);
            const isActive = active === c.key;
            return (
              <button
                key={c.key}
                type="button"
                onMouseEnter={() => replay(c.key)}
                onClick={() => replay(c.key)}
                className={cn(
                  "group flex items-center gap-3 rounded-2xl border px-4 py-3.5 text-left transition-all duration-500",
                  c.tint,
                  hasArrived ? c.border : "border-border/70",
                  hasArrived ? "opacity-100 translate-x-0" : "opacity-40 translate-x-0",
                  isActive && hasArrived && "shadow-[0_8px_24px_-10px_rgba(16,17,20,0.25)] scale-[1.02]",
                  sequenceDone && "cursor-pointer"
                )}
                style={{ transitionDelay: visible ? `${CHANNELS.indexOf(c) * 90}ms` : "0ms" }}
                tabIndex={sequenceDone ? 0 : -1}
              >
                <div
                  className={cn(
                    "w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 relative overflow-hidden transition-transform duration-300",
                    c.iconClass,
                    isActive && "scale-110"
                  )}
                  style={hasArrived ? { boxShadow: `0 6px 20px -6px ${c.brand}88` } : undefined}
                >
                  <div className="absolute inset-0 bg-gradient-to-b from-white/25 to-transparent" />
                  <c.glyph className="w-5 h-5 relative" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-sm font-medium text-ink truncate">{c.sender}</span>
                  </div>
                  <div className="text-[11px] text-ink/40 mb-0.5">{c.meta}</div>
                  <div className="text-xs text-ink/60 truncate">{c.text}</div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Connector layer — thick luminous gradient paths with a soft glow duplicate and traveling light */}
        <div className="self-stretch h-full">
          <svg viewBox="0 0 100 140" preserveAspectRatio="none" className="w-full h-full">
            <defs>
              {CHANNELS.map((c) => (
                <linearGradient key={c.key} id={`grad-${c.key}`} x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor={c.brand} stopOpacity="0.75" />
                  <stop offset="100%" stopColor="#6D5AE6" stopOpacity="0.85" />
                </linearGradient>
              ))}
            </defs>
            {CHANNELS.map((c) => {
              const hasArrived = arrived.has(c.key);
              const d = connectorPath(c.key);
              const isActive = active === c.key;
              return (
                <g key={c.key}>
                  {/* soft glow layer */}
                  <path
                    d={d}
                    fill="none"
                    stroke={c.brand}
                    strokeWidth={isActive ? 10 : 7}
                    strokeLinecap="round"
                    opacity={hasArrived ? (isActive ? 0.16 : 0.08) : 0}
                    style={{ transition: "opacity 500ms ease-out, stroke-width 400ms ease-out", filter: "blur(4px)" }}
                  />
                  {/* crisp gradient line */}
                  <path
                    d={d}
                    fill="none"
                    stroke={`url(#grad-${c.key})`}
                    strokeWidth={isActive ? 2.6 : 1.8}
                    strokeLinecap="round"
                    pathLength={1}
                    strokeDasharray={1}
                    strokeDashoffset={hasArrived ? 0 : 1}
                    style={{ transition: `stroke-dashoffset 650ms cubic-bezier(0.4,0,0.2,1), stroke-width 300ms ease-out` }}
                  />
                  {!reducedMotion && hasArrived && (
                    <>
                      <circle r="2.2" fill={c.brand} style={{ filter: `drop-shadow(0 0 3px ${c.brand})` }}>
                        <animateMotion dur="2.4s" begin={`${CHANNELS.indexOf(c) * 0.35}s`} repeatCount="indefinite" path={d} />
                        <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.08;0.85;1" dur="2.4s" begin={`${CHANNELS.indexOf(c) * 0.35}s`} repeatCount="indefinite" />
                      </circle>
                      <circle r="1.4" fill="#6D5AE6" style={{ filter: "drop-shadow(0 0 2px #6D5AE6)" }}>
                        <animateMotion dur="2.4s" begin={`${CHANNELS.indexOf(c) * 0.35 + 0.18}s`} repeatCount="indefinite" path={d} />
                        <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.08;0.85;1" dur="2.4s" begin={`${CHANNELS.indexOf(c) * 0.35 + 0.18}s`} repeatCount="indefinite" />
                      </circle>
                    </>
                  )}
                </g>
              );
            })}
          </svg>
        </div>

        {/* The Daythread workspace — the visual centerpiece. Fixed height from first paint,
            so nothing ever collapses or pops from a blank state. */}
        <div
          className="relative rounded-3xl border border-border bg-white overflow-hidden transition-shadow duration-500"
          style={{
            boxShadow: justArrived
              ? "0 0 0 3px rgba(109,90,230,0.28), 0 20px 48px -16px rgba(16,17,20,0.22)"
              : "0 20px 48px -20px rgba(16,17,20,0.16)",
          }}
        >
          <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
            <span className={cn("w-2 h-2 rounded-full bg-signal shrink-0", !reducedMotion && justArrived && "animate-ping")} />
            <span className="font-display text-sm text-ink">Daythread</span>
            <span key={arrived.size} className={cn("ml-auto text-[11px] text-ink/40", !reducedMotion && justArrived && "animate-[fadeUp_0.3s_ease-out]")}>
              {arrived.size} conversation{arrived.size === 1 ? "" : "s"}
            </span>
          </div>

          {/* Insight strip — grows as the workspace organizes what's arrived */}
          <div
            className={cn(
              "px-5 border-b border-border bg-signal-soft/50 flex items-center gap-2 overflow-hidden transition-all duration-500",
              arrived.size > 0 ? "py-2.5 opacity-100" : "py-0 opacity-0"
            )}
          >
            <span className="text-[11px] font-medium text-signal-text">${totalValue.toLocaleString()} in potential bookings</span>
            <span className="text-[11px] text-ink/30">·</span>
            <span className="text-[11px] text-ink/45">organized automatically</span>
          </div>

          <div className="divide-y divide-border min-h-[300px] flex flex-col">
            {CHANNELS.map((c) => {
              const hasArrived = arrived.has(c.key);
              if (!hasArrived) return null;
              return (
                <div
                  key={c.key}
                  className={cn(
                    "flex items-center gap-3 px-5 py-3.5 animate-[fadeUp_0.4s_cubic-bezier(0.34,1.3,0.64,1)_backwards]",
                    !reducedMotion && justArrived === c.key && "animate-[pulseHighlight_1s_ease-out]"
                  )}
                >
                  <div className={cn("w-9 h-9 rounded-full flex items-center justify-center shrink-0", c.iconClass)}>
                    <c.glyph className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium text-ink truncate">{c.sender}</span>
                      <span className={cn("text-[10px] font-medium rounded-full px-1.5 py-0.5 shrink-0", TONE_CLASSES[c.resultTone])}>{c.resultTag}</span>
                    </div>
                    <div className="text-xs text-ink/45 truncate">{c.text}</div>
                  </div>
                  <span className="text-xs font-display text-ink/70 shrink-0">${c.value.toLocaleString()}</span>
                </div>
              );
            })}
            {arrived.size === 0 && (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 py-10">
                <div className="w-11 h-11 rounded-2xl bg-signal-soft flex items-center justify-center">
                  <span className="w-2.5 h-2.5 rounded-full bg-signal" />
                </div>
                <p className="text-sm text-ink/50 text-center">Your workspace, ready to organize itself.</p>
                <div className="w-full space-y-2 mt-1">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="h-9 rounded-lg bg-black/[0.03]" />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile: channels in a row, then the workspace full-width below — no connector SVG */}
      <div className="md:hidden relative flex flex-col gap-6">
        <div className="grid grid-cols-4 gap-2.5">
          {CHANNELS.map((c) => {
            const hasArrived = arrived.has(c.key);
            const isActive = active === c.key;
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => replay(c.key)}
                className={cn("flex flex-col items-center gap-1.5 transition-all duration-500", hasArrived ? "opacity-100" : "opacity-40")}
                style={{ transitionDelay: visible ? `${CHANNELS.indexOf(c) * 90}ms` : "0ms" }}
              >
                <div
                  className={cn("w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 transition-transform duration-300", c.iconClass, isActive && "scale-110")}
                  style={hasArrived ? { boxShadow: `0 6px 16px -6px ${c.brand}88` } : undefined}
                >
                  <c.glyph className="w-[18px] h-[18px]" />
                </div>
                <span className="text-[10px] font-medium text-ink/50 truncate max-w-full">{c.label}</span>
              </button>
            );
          })}
        </div>

        <div
          className="relative rounded-2xl border border-border bg-white overflow-hidden transition-shadow duration-500"
          style={{
            boxShadow: justArrived ? "0 0 0 3px rgba(109,90,230,0.28), 0 16px 36px -16px rgba(16,17,20,0.2)" : "0 16px 36px -20px rgba(16,17,20,0.14)",
          }}
        >
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
            <span className={cn("w-1.5 h-1.5 rounded-full bg-signal shrink-0", !reducedMotion && justArrived && "animate-ping")} />
            <span className="font-display text-sm text-ink">Daythread</span>
            <span className="ml-auto text-[11px] text-ink/40">{arrived.size} conversation{arrived.size === 1 ? "" : "s"}</span>
          </div>
          <div className={cn("px-4 border-b border-border bg-signal-soft/50 overflow-hidden transition-all duration-500", arrived.size > 0 ? "py-2 opacity-100" : "py-0 opacity-0")}>
            <span className="text-[11px] font-medium text-signal-text">${totalValue.toLocaleString()} in potential bookings</span>
          </div>
          <div className="divide-y divide-border min-h-[200px] flex flex-col">
            {CHANNELS.map((c) => {
              if (!arrived.has(c.key)) return null;
              return (
                <div
                  key={c.key}
                  className={cn(
                    "flex items-center gap-2.5 px-4 py-3 animate-[fadeUp_0.4s_cubic-bezier(0.34,1.3,0.64,1)_backwards]",
                    !reducedMotion && justArrived === c.key && "animate-[pulseHighlight_1s_ease-out]"
                  )}
                >
                  <div className={cn("w-8 h-8 rounded-full flex items-center justify-center shrink-0", c.iconClass)}>
                    <c.glyph className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium text-ink truncate">{c.sender}</span>
                      <span className={cn("text-[9px] font-medium rounded-full px-1.5 py-0.5 shrink-0", TONE_CLASSES[c.resultTone])}>{c.resultTag}</span>
                    </div>
                    <div className="text-[11px] text-ink/45 truncate">{c.text}</div>
                  </div>
                </div>
              );
            })}
            {arrived.size === 0 && (
              <div className="flex-1 flex flex-col items-center justify-center gap-2 px-6 py-8">
                <p className="text-xs text-ink/50 text-center">Your workspace, ready to organize itself.</p>
                <div className="w-full space-y-1.5 mt-1">
                  {[0, 1].map((i) => (
                    <div key={i} className="h-7 rounded-lg bg-black/[0.03]" />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
