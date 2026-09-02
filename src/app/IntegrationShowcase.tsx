"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * The integrations story, told as one continuous composition rather than a step-by-step
 * click-through: three real channel messages, each on its own animated path, converging
 * into a single growing Daythread inbox. Hovering a channel highlights its path; the
 * inbox visibly gains a row as each source "arrives." Channel brand colors (Instagram's
 * gradient, Gmail's red, iMessage-style green) are kept authentic — the signal color
 * (violet) belongs to Daythread's side of the story, not theirs.
 */

type ChannelKey = "instagram" | "gmail" | "sms";

const CHANNELS: {
  key: ChannelKey;
  label: string;
  badgeClass: string;
  sender: string;
  meta: string;
  text: string;
  resultLabel: string;
  resultMeta: string;
}[] = [
  {
    key: "instagram",
    label: "Instagram",
    badgeClass: "bg-gradient-to-br from-[#FEDA75] via-[#D62976] to-[#4F5BD5]",
    sender: "Sarah Johnson",
    meta: "Instagram · DM",
    text: "Are you available June 14?",
    resultLabel: "Sarah Johnson",
    resultMeta: "New client · Instagram",
  },
  {
    key: "gmail",
    label: "Gmail",
    badgeClass: "bg-[#EA4335]",
    sender: "Priya Patel",
    meta: "priya.patel@gmail.com",
    text: "Following up on pricing for a September date",
    resultLabel: "Priya Patel",
    resultMeta: "Booking drafted · $1,200",
  },
  {
    key: "sms",
    label: "SMS",
    badgeClass: "bg-[#2FC26E]",
    sender: "(512) 555-0148",
    meta: "SMS",
    text: "Do you have anything open next week?",
    resultLabel: "(512) 555-0148",
    resultMeta: "Conversation opened · SMS",
  },
];

function InstagramGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="5" stroke="white" strokeWidth="1.75" />
      <circle cx="12" cy="12" r="4" stroke="white" strokeWidth="1.75" />
      <circle cx="17" cy="7" r="1" fill="white" />
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

const GLYPHS: Record<ChannelKey, typeof InstagramGlyph> = { instagram: InstagramGlyph, gmail: GmailGlyph, sms: SmsGlyph };

// Curved paths in a 100x100 viewBox, each source flowing down/right into the inbox anchor.
const PATHS: Record<ChannelKey, string> = {
  instagram: "M 8 18 C 35 18, 45 30, 68 46",
  gmail: "M 8 50 C 35 50, 45 48, 68 50",
  sms: "M 8 82 C 35 82, 45 68, 68 54",
};

export function IntegrationShowcase() {
  const [visible, setVisible] = useState(false);
  const [hovered, setHovered] = useState<ChannelKey | null>(null);
  const [arrived, setArrived] = useState<Set<ChannelKey>>(new Set());
  const [reducedMotion, setReducedMotion] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

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
            setTimeout(() => setArrived((prev) => new Set(prev).add(c.key)), 900 + i * 550);
          });
          observer.disconnect();
        }
      },
      { threshold: 0.35 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="max-w-5xl mx-auto px-6">
      <div className="text-center max-w-lg mx-auto mb-14">
        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-signal-text mb-3">How it works</div>
        <h2 className="font-display text-3xl md:text-[2.5rem] leading-[1.1] text-ink">
          Chaos comes in. <span className="text-signal-text">Work</span> comes out.
        </h2>
        <p className="mt-4 text-ink/55 text-sm md:text-base max-w-md mx-auto">
          Your business already lives across Instagram, email, and text. Daythread is where it becomes organized.
        </p>
      </div>

      <div className="relative">
        {/* Atmospheric glow anchored precisely behind the Daythread card — purposeful depth, not decoration */}
        <div
          className="absolute right-0 top-1/2 -translate-y-1/2 w-[420px] h-[420px] rounded-full opacity-[0.16] blur-3xl pointer-events-none"
          style={{ background: "radial-gradient(circle, #6D5AE6 0%, transparent 70%)" }}
          aria-hidden
        />

        <div className="relative grid md:grid-cols-[1fr_auto_1.1fr] gap-6 md:gap-2 items-center">
          {/* Channel message cards */}
          <div className="flex flex-col gap-5 order-2 md:order-1">
            {CHANNELS.map((c) => {
              const Glyph = GLYPHS[c.key];
              const isDimmed = hovered !== null && hovered !== c.key;
              return (
                <div
                  key={c.key}
                  onMouseEnter={() => setHovered(c.key)}
                  onMouseLeave={() => setHovered(null)}
                  className={cn(
                    "flex items-center gap-3 rounded-2xl border border-border bg-white px-4 py-3.5 shadow-card transition-all duration-300 cursor-default",
                    visible ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-3",
                    isDimmed ? "opacity-40 scale-[0.98]" : "opacity-100 scale-100"
                  )}
                  style={{ transitionDelay: visible ? `${CHANNELS.indexOf(c) * 120}ms` : "0ms" }}
                >
                  <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center shrink-0 shadow-sm relative overflow-hidden", c.badgeClass)}>
                    <div className="absolute inset-0 bg-gradient-to-b from-white/25 to-transparent" />
                    <Glyph className="w-5 h-5 relative" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-sm font-medium text-ink truncate">{c.sender}</span>
                    </div>
                    <div className="text-[11px] text-ink/40 mb-0.5">{c.meta}</div>
                    <div className="text-xs text-ink/55 truncate max-w-[220px]">{c.text}</div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Connector paths with traveling light */}
          <div className="hidden md:block order-2 self-stretch w-24 lg:w-32">
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full text-ink/15">
              <defs>
                <linearGradient id="pathFade" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="currentColor" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="#6D5AE6" stopOpacity="0.5" />
                </linearGradient>
              </defs>
              {CHANNELS.map((c) => {
                const isDimmed = hovered !== null && hovered !== c.key;
                return (
                  <path
                    key={c.key}
                    d={PATHS[c.key]}
                    fill="none"
                    stroke="url(#pathFade)"
                    strokeWidth={isDimmed ? 0.6 : 1.1}
                    strokeLinecap="round"
                    pathLength={1}
                    strokeDasharray={1}
                    strokeDashoffset={visible ? 0 : 1}
                    className="transition-all duration-700"
                    style={{ transitionDelay: `${CHANNELS.indexOf(c) * 120}ms`, opacity: isDimmed ? 0.35 : 1 }}
                  />
                );
              })}
              {!reducedMotion &&
                visible &&
                CHANNELS.map((c, i) => (
                  <circle key={`dot-${c.key}`} r="1.6" fill="#6D5AE6">
                    <animateMotion dur="2.8s" begin={`${1 + i * 0.5}s`} repeatCount="indefinite" path={PATHS[c.key]} />
                    <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.1;0.85;1" dur="2.8s" begin={`${1 + i * 0.5}s`} repeatCount="indefinite" />
                  </circle>
                ))}
            </svg>
          </div>

          {/* The Daythread inbox — grows as sources connect */}
          <div className={cn("order-1 md:order-3 transition-all duration-500", visible ? "opacity-100 scale-100" : "opacity-0 scale-[0.97]")}>
            <div className="rounded-2xl border border-border bg-white shadow-popover overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
                <span className="w-2 h-2 rounded-full bg-signal shrink-0" />
                <span className="font-display text-sm text-ink">Daythread</span>
                <span className="ml-auto text-[11px] text-ink/40">{arrived.size} conversation{arrived.size === 1 ? "" : "s"}</span>
              </div>
              <div className="divide-y divide-border min-h-[188px]">
                {CHANNELS.map((c) => {
                  const hasArrived = arrived.has(c.key);
                  const Glyph = GLYPHS[c.key];
                  return (
                    <div
                      key={c.key}
                      className={cn(
                        "flex items-center gap-3 px-5 py-3.5 transition-all duration-500",
                        hasArrived ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-1 pointer-events-none absolute"
                      )}
                    >
                      <div className={cn("w-8 h-8 rounded-full flex items-center justify-center shrink-0", c.badgeClass)}>
                        <Glyph className="w-3.5 h-3.5" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-ink truncate">{c.resultLabel}</div>
                        <div className="text-xs text-signal-text">{c.resultMeta}</div>
                      </div>
                    </div>
                  );
                })}
                {arrived.size === 0 && (
                  <div className="flex items-center justify-center h-[188px] text-xs text-ink/35">Waiting for the first message…</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
