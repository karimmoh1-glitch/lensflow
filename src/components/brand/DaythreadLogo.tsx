import { cn } from "@/lib/utils";

/**
 * The Daythread mark: three strands — the channels a business already runs on — converging
 * into one thread, which ends in the node where the work happens. The strands are drawn in
 * the surrounding text color so the mark sits on ink or paper without a container; the node
 * is always the brand coral. Legible at 16px, identical at 512px.
 *
 * Vector sources: /public/brand/daythread-mark.svg, -app-icon.svg, -wordmark.svg, -lockup.svg.
 */
export function DaythreadMark({ className, node = "#F0524D", title }: { className?: string; node?: string; title?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden={title ? undefined : true} role={title ? "img" : undefined} fill="none">
      {title && <title>{title}</title>}
      <g stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 8.5C11 8.5 12.5 16 18 16" />
        <path d="M5 16H18" />
        <path d="M5 23.5C11 23.5 12.5 16 18 16" />
      </g>
      <circle cx="24.5" cy="16" r="3.5" fill={node} />
    </svg>
  );
}

/** Mark + wordmark, for headers and auth pages. */
export function DaythreadLogo({ className, markClassName, wordClassName }: { className?: string; markClassName?: string; wordClassName?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-ink", className)}>
      <DaythreadMark className={cn("w-6 h-6 shrink-0", markClassName)} title="Daythread" />
      <span className={cn("font-sans font-extrabold text-[17px] tracking-[-0.02em] leading-none", wordClassName)}>Daythread</span>
    </span>
  );
}
