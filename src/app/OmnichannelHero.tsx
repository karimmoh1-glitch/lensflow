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

// Coordinates are percentages within the diagram's viewBox (400 x 300).
const CHANNELS: Channel[] = [
  { key: "instagram", label: "Instagram", icon: CameraGlyph, x: 92, y: 38, bg: "bg-gradient-to-br from-[#FEDA75] via-[#D62976] to-[#4F5BD5]" },
  { key: "messages", label: "Messages", icon: MessageSquare, x: 308, y: 38, bg: "bg-[#3B82F6]" },
  { key: "email", label: "Email", icon: Mail, x: 30, y: 158, bg: "bg-[#4F46E5]" },
  { key: "whatsapp", label: "WhatsApp", icon: MessageCircle, x: 282, y: 274, bg: "bg-[#25D366]" },
  { key: "phone", label: "Phone", icon: Phone, x: 372, y: 214, bg: "bg-[#0D9488]" },
];

const ARROWS: [number, number, number, number][] = [
  [200, 56, 200, 116], // instagram + messages -> top of card
  [58, 158, 138, 160], // email -> left of card
  [327, 246, 234, 190], // whatsapp + phone -> bottom-right of card
];

export function OmnichannelHero() {
  const [mounted, setMounted] = useState(false);
  const reducedMotion = useRef(false);

  useEffect(() => {
    reducedMotion.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion.current) {
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
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 400 300" fill="none" preserveAspectRatio="xMidYMid meet" aria-hidden>
          {ARROWS.map(([x1, y1, x2, y2], i) => (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="currentColor"
              className="text-ink/15"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeDasharray={180}
              strokeDashoffset={mounted ? 0 : 180}
              style={{ transition: `stroke-dashoffset 700ms ease-out ${180 + i * 100}ms` }}
            />
          ))}
        </svg>

        {CHANNELS.map((c, i) => (
          <div
            key={c.key}
            className={cn("absolute flex flex-col items-center gap-1.5 transition-all duration-500 ease-out", mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2")}
            style={{ left: `${(c.x / 400) * 100}%`, top: `${(c.y / 300) * 100}%`, transform: "translate(-50%, -50%)", transitionDelay: `${i * 70}ms` }}
          >
            <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-[0_6px_16px_-4px_rgba(16,17,20,0.25)]", c.bg)}>
              <c.icon className="w-5 h-5" strokeWidth={1.9} />
            </div>
            <span className="text-[11px] text-ink/45 font-medium">{c.label}</span>
          </div>
        ))}

        <div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 transition-all duration-500 ease-out"
          style={{ transitionDelay: "460ms", opacity: mounted ? 1 : 0, transform: `translate(-50%, -50%) scale(${mounted ? 1 : 0.92})` }}
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
