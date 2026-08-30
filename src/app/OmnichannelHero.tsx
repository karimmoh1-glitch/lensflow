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
};

// Arranged as a shallow arc above the card so every connector reads as one clean fan
// converging on a single point — never crossing behind an icon, never ambiguous.
const CARD_TOP: [number, number] = [200, 158];
const CHANNELS: Channel[] = [
  { key: "instagram", label: "Instagram", icon: CameraGlyph, x: 44, y: 108, bg: "bg-gradient-to-br from-[#FEDA75] via-[#D62976] to-[#4F5BD5]" },
  { key: "messages", label: "Messages", icon: MessageSquare, x: 138, y: 52, bg: "bg-[#3B82F6]" },
  { key: "email", label: "Email", icon: Mail, x: 200, y: 34, bg: "bg-[#4F46E5]" },
  { key: "whatsapp", label: "WhatsApp", icon: MessageCircle, x: 262, y: 52, bg: "bg-[#25D366]" },
  { key: "phone", label: "Phone", icon: Phone, x: 356, y: 108, bg: "bg-[#0D9488]" },
];

function connectorPath(x: number, y: number): string {
  const [cx, cy] = CARD_TOP;
  const midY = (y + cy) / 2;
  return `M ${x} ${y + 22} Q ${x} ${midY} ${cx} ${cy}`;
}

export function OmnichannelHero() {
  const [mounted, setMounted] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setReducedMotion(reduced);
    if (reduced) {
      setMounted(true);
      return;
    }
    const t = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(t);
  }, []);

  return (
    <div className="relative w-full h-full">
      {/* Desktop / tablet diagram */}
      <div className="hidden sm:block relative w-full h-full max-w-2xl mx-auto">
        {/* Soft glow behind the destination card — gives it depth as the "answer" the eye lands on */}
        <div
          className={cn("absolute rounded-full bg-accent/10 blur-3xl transition-opacity duration-700", mounted && !reducedMotion && "animate-pulse")}
          style={{ left: "50%", top: "58%", width: 260, height: 200, transform: "translate(-50%,-50%)", opacity: mounted ? 1 : 0, transitionDelay: "300ms" }}
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
                style={{ transition: `stroke-dashoffset 750ms ease-out ${180 + i * 90}ms` }}
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
                <animateMotion dur="2.6s" begin={`${0.9 + i * 0.4}s`} repeatCount="indefinite" path={connectorPath(c.x, c.y)} />
                <animate attributeName="opacity" values="0;1;1;0;0" keyTimes="0;0.08;0.55;0.62;1" dur="2.6s" begin={`${0.9 + i * 0.4}s`} repeatCount="indefinite" />
              </circle>
            ))}
        </svg>

        {CHANNELS.map((c, i) => (
          <div
            key={c.key}
            className={cn("absolute flex flex-col items-center gap-1.5 transition-all duration-500 ease-out", mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2")}
            style={{ left: `${(c.x / 400) * 100}%`, top: `${(c.y / 300) * 100}%`, transform: "translate(-50%, -50%)", transitionDelay: `${i * 70}ms` }}
          >
            <div className={cn("w-11 h-11 rounded-2xl flex items-center justify-center text-white shadow-[0_6px_16px_-4px_rgba(16,17,20,0.25)]", c.bg)}>
              <c.icon className="w-[18px] h-[18px]" strokeWidth={1.9} />
            </div>
            <span className="text-[11px] text-ink/45 font-medium">{c.label}</span>
          </div>
        ))}

        <div
          className="absolute left-1/2 transition-all duration-500 ease-out"
          style={{ left: "50%", top: `${(CARD_TOP[1] / 300) * 100 + 22}%`, transform: "translate(-50%, 0)", transitionDelay: "460ms", opacity: mounted ? 1 : 0 }}
        >
          <SummaryCard />
        </div>
      </div>

      {/* Mobile: simplified vertical stack */}
      <div className="sm:hidden flex flex-col items-center gap-3">
        <div className="flex items-center gap-2.5">
          {CHANNELS.map((c) => (
            <div key={c.key} className={cn("w-9 h-9 rounded-xl flex items-center justify-center text-white shrink-0", c.bg)}>
              <c.icon className="w-4 h-4" strokeWidth={1.9} />
            </div>
          ))}
        </div>
        <div className="w-px h-5 bg-ink/15" />
        <SummaryCard compact />
      </div>
    </div>
  );
}

function SummaryCard({ compact }: { compact?: boolean }) {
  return (
    <div className={cn("rounded-2xl border border-border bg-white shadow-popover overflow-hidden", compact ? "w-64" : "w-72")}>
      <div className="px-4 py-3 border-b border-border">
        <span className="font-display text-sm text-ink">LensFlow</span>
      </div>
      <div className="p-4 space-y-2.5">
        <SummaryRow label="New leads" value="12" tone="accent" />
        <SummaryRow label="Bookings this week" value="4" />
        <SummaryRow label="Outstanding" value="$1,240" tone="warning" />
      </div>
    </div>
  );
}

function SummaryRow({ label, value, tone }: { label: string; value: string; tone?: "accent" | "warning" }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-ink/50">{label}</span>
      <span className={cn("text-sm font-display", tone === "accent" ? "text-accent-text" : tone === "warning" ? "text-warning-text" : "text-ink")}>
        {value}
      </span>
    </div>
  );
}
