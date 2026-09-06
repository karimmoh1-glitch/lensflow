import { cn } from "@/lib/utils";
import { DaythreadMark } from "@/components/brand/DaythreadLogo";

/**
 * Brand entry points used across the marketing site and the app. The mark itself lives in
 * components/brand/DaythreadLogo (three strands converging into one thread, ending in the
 * coral node). Kept here so every existing import keeps working.
 */
export function LogoMark({ className }: { className?: string }) {
  return <DaythreadMark className={className} />;
}

/** App-icon / favicon variant — the mark on a solid ink badge, for contexts (favicon, OG
 * image) where a glyph alone would be illegible or context-less. */
export function LogoBadge({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="8" fill="#101114" />
      <g fill="none" stroke="#FAFAF9" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M7 10C11.5 10 12.5 16 17 16" />
        <path d="M7 16H17" />
        <path d="M7 22C11.5 22 12.5 16 17 16" />
      </g>
      <circle cx="23" cy="16" r="3" fill="#F0524D" />
    </svg>
  );
}

export function Logo({ className, markClassName, wordmarkClassName }: { className?: string; markClassName?: string; wordmarkClassName?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5 text-ink", className)}>
      <LogoMark className={cn("w-6 h-6 shrink-0", markClassName)} />
      <span className={cn("font-display text-lg tracking-tight", wordmarkClassName)}>Daythread</span>
    </span>
  );
}
