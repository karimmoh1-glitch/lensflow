import { cn } from "@/lib/utils";

/**
 * The brand mark: a single continuous thread, drawn in one color (currentColor) with no
 * gradient and no container badge — the glyph itself is the mark, the way Linear or
 * Stripe's icon reads on its own. Works identically in ink-on-paper or paper-on-ink
 * contexts; the caller sets color via className.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="none">
      <path d="M4 18C9 18 9 6 15 6C17 6 18.5 7.5 20 9" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

/** App-icon / favicon variant — a solid square badge, for contexts (favicon, OG image)
 * where a glyph alone would be illegible or context-less. Solid ink fill, no gradient. */
export function LogoBadge({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="8" fill="#101114" />
      <path d="M6 24C12 24 12 8 19 8C21.5 8 23.5 10 25 12" stroke="#FAFAF9" strokeWidth="2.25" strokeLinecap="round" fill="none" />
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
