"use client";

import { useEffect, useRef, useState } from "react";
import { MessageSquare, Mail, Phone, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";

function CameraGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" strokeWidth="1.75" />
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.75" />
      <circle cx="17" cy="7" r="1" fill="currentColor" />
    </svg>
  );
}

type IconComponent = (props: { className?: string; strokeWidth?: number }) => React.ReactNode;

type Channel = {
  key: string;
  label: string;
  icon: IconComponent;
  x: number;
  y: number;
  bg: string;
  /** Where this channel flies in FROM — far off in its own direction, so the opening
   * reads as "scattered communication converging," not five icons nudging into place. */
  fromX: number;
  fromY: number;
};

// Arranged as a shallow arc above the card so every connector reads as one clean fan
// converging on a single point — never crossing behind an icon, never ambiguous.
const CARD_TOP: [number, number] = [200, 158];
const CHANNELS: Channel[] = [
  { key: "instagram", label: "Instagram", icon: CameraGlyph, x: 44, y: 108, bg: "bg-gradient-to-br from-[#FEDA75] via-[#D62976] to-[#4F5BD5]", fromX: -220, fromY: -60 },
  { key: "messages", label: "Messages", icon: MessageSquare, x: 138, y: 52, bg: "bg-[#3B82F6]", fromX: -120, fromY: -180 },
  { key: "email", label: "Email", icon: Mail, x: 200, y: 34, bg: "bg-[#4F46E5]", fromX: 0, fromY: -220 },
  { key: "whatsapp", label: "WhatsApp", icon: MessageCircle, x: 262, y: 52, bg: "bg-[#25D366]", fromX: 130, fromY: -180 },
  { key: "phone", label: "Phone", icon: Phone, x: 356, y: 108, bg: "bg-[#0D9488]", fromX: 230, fromY: -60 },
];

function connectorPath(x: number, y: number): string {
  const [cx, cy] = CARD_TOP;
  const midY = (y + cy) / 2;
  return `M ${x} ${y + 22} Q ${x} ${midY} ${cx} ${cy}`;
}

const POP = "cubic-bezier(0.22,1.4,0.36,1)"; // fast with a real overshoot — confident, playful

export function OmnichannelHero({ startDelayMs = 0 }: { startDelayMs?: number }) {
  const [mounted, setMounted] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setReducedMotion(reduced);
    if (reduced) {
      setMounted(true);
      return;
    }
    const t = setTimeout(() => setMounted(true), startDelayMs);
    return () => clearTimeout(t);
  }, [startDelayMs]);

  return (
    <div className="relative w-full h-full">
      {/* Desktop / tablet diagram */}
      <div className="hidden sm:block relative w-full h-full max-w-2xl mx-auto">
        {/* Soft glow behind the destination card — gives it depth as the "answer" the eye lands on */}
        <div
          className={cn("absolute rounded-full bg-accent/10 blur-3xl transition-opacity duration-700", mounted && !reducedMotion && "animate-pulse")}
          style={{ left: "50%", top: "58%", width: 260, height: 200, transform: "translate(-50%,-50%)", opacity: mounted ? 1 : 0, transitionDelay: "500ms" }}
          aria-hidden
        />

        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 400 300" fill="none" preserveAspectRatio="xMidYMid meet" aria-hidden>
          <defs>
            <linearGradient id="connectorFade" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.28" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0.06" />
            </linearGradient>
          </defs>
          {CHANNELS.map((c, i) => {
            const d = connectorPath(c.x, c.y);
            return (
              <path
                key={c.key}
                id={`connector-${c.key}`}
                d={d}
                stroke="url(#connectorFade)"
                className="text-ink"
                strokeWidth={1.5}
                strokeLinecap="round"
                fill="none"
                pathLength={1}
                strokeDasharray={1}
                strokeDashoffset={mounted ? 0 : 1}
                style={{ transition: `stroke-dashoffset 550ms ease-out ${420 + i * 80}ms` }}
              />
            );
          })}
          {/* Light pulses keep traveling toward the card for as long as the hero is
              visible — repeatCount="indefinite" rather than the one-shot fill="freeze"
              this used before, staggered per channel so they read as a steady stream
              rather than everything blinking in sync. */}
          {!reducedMotion &&
            mounted &&
            CHANNELS.map((c, i) => (
              <circle key={`dot-${c.key}`} r="2.5" fill="currentColor" className="text-accent">
                <animateMotion dur="2.6s" begin={`${1.1 + i * 0.4}s`} repeatCount="indefinite" path={connectorPath(c.x, c.y)} />
                <animate attributeName="opacity" values="0;1;1;0;0" keyTimes="0;0.08;0.55;0.62;1" dur="2.6s" begin={`${1.1 + i * 0.4}s`} repeatCount="indefinite" />
              </circle>
            ))}
        </svg>

        {CHANNELS.map((c, i) => (
          <div
            key={c.key}
            className={cn("absolute flex flex-col items-center gap-1.5 group", !reducedMotion && mounted && "animate-[chipFloat_5s_ease-in-out_infinite]")}
            style={{
              left: `${(c.x / 400) * 100}%`,
              top: `${(c.y / 300) * 100}%`,
              transition: `transform 650ms ${POP} ${i * 90}ms, opacity 400ms ease-out ${i * 90}ms`,
              transform: mounted ? "translate(-50%, -50%) scale(1)" : `translate(calc(-50% + ${c.fromX}px), calc(-50% + ${c.fromY}px)) scale(0.3)`,
              opacity: mounted ? 1 : 0,
              animationDelay: `${1.6 + i * 0.26}s`,
            }}
          >
            <div
              className={cn(
                "w-11 h-11 rounded-2xl flex items-center justify-center text-white shadow-[0_6px_16px_-4px_rgba(16,17,20,0.25)] transition-transform duration-200 group-hover:scale-110 group-hover:-translate-y-0.5",
                c.bg
              )}
            >
              <c.icon className="w-[18px] h-[18px]" strokeWidth={1.9} />
            </div>
            <span className="text-[11px] text-ink/45 font-medium">{c.label}</span>
          </div>
        ))}

        <div
          className="absolute left-1/2"
          style={{
            left: "50%",
            top: `${(CARD_TOP[1] / 300) * 100}%`,
            transition: `transform 600ms ${POP} 620ms, opacity 350ms ease-out 620ms`,
            transform: mounted ? "translate(-50%, 0) scale(1)" : "translate(-50%, 12px) scale(0.55)",
            opacity: mounted ? 1 : 0,
          }}
        >
          <div className={cn(!reducedMotion && mounted && "animate-[cardFloat_6s_ease-in-out_infinite]")} style={{ animationDelay: "1.3s" }}>
            <SummaryCard />
          </div>
        </div>
      </div>

      {/* Mobile: simplified vertical stack — same converging idea, lighter execution */}
      <div className="sm:hidden flex flex-col items-center gap-3">
        <div className="flex items-center gap-2.5">
          {CHANNELS.map((c, i) => (
            <div
              key={c.key}
              className={cn("w-9 h-9 rounded-xl flex items-center justify-center text-white shrink-0", c.bg)}
              style={{
                transition: `transform 500ms ${POP} ${i * 80}ms, opacity 350ms ease-out ${i * 80}ms`,
                transform: mounted ? "translateY(0) scale(1)" : "translateY(-28px) scale(0.5)",
                opacity: mounted ? 1 : 0,
              }}
            >
              <c.icon className="w-4 h-4" strokeWidth={1.9} />
            </div>
          ))}
        </div>
        <div
          className="w-px h-5 bg-ink/15"
          style={{ transition: "opacity 300ms ease-out 480ms", opacity: mounted ? 1 : 0 }}
        />
        <div
          style={{
            transition: `transform 550ms ${POP} 520ms, opacity 350ms ease-out 520ms`,
            transform: mounted ? "scale(1)" : "scale(0.6)",
            opacity: mounted ? 1 : 0,
          }}
        >
          <SummaryCard compact />
        </div>
      </div>
    </div>
  );
}

// The same three people who reappear in the "Chaos comes in" section below — one
// continuous story instead of throwaway placeholder rows, so the hero's payoff and the
// section that explains it feel like one product, not two disconnected mockups.
const INBOX_PREVIEW = [
  { name: "Sarah Johnson", msg: "Are you available June 14?", icon: CameraGlyph, bg: "bg-gradient-to-br from-[#FEDA75] via-[#D62976] to-[#4F5BD5]" },
  { name: "Priya Patel", msg: "Following up on pricing for a September date", icon: Mail, bg: "bg-[#4F46E5]" },
  { name: "(512) 555-0148", msg: "Do you have anything open next week?", icon: MessageCircle, bg: "bg-[#2FC26E]" },
];

function SummaryCard({ compact }: { compact?: boolean }) {
  return (
    <div className={cn("rounded-2xl border border-border bg-white shadow-popover overflow-hidden", compact ? "w-72" : "w-[336px]")}>
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <span className="w-1.5 h-1.5 rounded-full bg-signal shrink-0" />
        <span className="font-display text-sm text-ink">Daythread</span>
        <span className="ml-auto text-[10px] font-medium text-ink/40">3 new</span>
      </div>
      <div className="divide-y divide-border">
        {INBOX_PREVIEW.map((row) => (
          <div key={row.name} className="flex items-center gap-2.5 px-4 py-2.5">
            <div className={cn("w-7 h-7 rounded-full flex items-center justify-center shrink-0", row.bg)}>
              <row.icon className="w-3.5 h-3.5 text-white" strokeWidth={2} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium text-ink truncate">{row.name}</div>
              <div className="text-[11px] text-ink/45 truncate">{row.msg}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between px-4 py-2.5 bg-paper/70 border-t border-border">
        <SummaryStat label="New leads" value="12" tone="accent" />
        <SummaryStat label="Bookings" value="4" />
        <SummaryStat label="Outstanding" value="$1,240" tone="warning" />
      </div>
    </div>
  );
}

function SummaryStat({ label, value, tone }: { label: string; value: string; tone?: "accent" | "warning" }) {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-wide text-ink/35">{label}</div>
      <div className={cn("text-xs font-display", tone === "accent" ? "text-accent-text" : tone === "warning" ? "text-warning-text" : "text-ink")}>
        {value}
      </div>
    </div>
  );
}
