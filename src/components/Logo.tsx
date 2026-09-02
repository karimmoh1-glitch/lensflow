import { cn } from "@/lib/utils";

/**
 * The brand mark: a single thread sweeping through a rounded square — literal enough to
 * read as "thread" at a glance, abstract enough to work as an app icon. Same gradient
 * (accent → gold) everywhere it appears: navbar, favicon, OG image, loading states.
 */
export function LogoMark({ className, id = "logo" }: { className?: string; id?: string }) {
  const gradientId = `${id}-grad`;
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden fill="none">
      <defs>
        <linearGradient id={gradientId} x1="2" y1="30" x2="30" y2="2" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#C75A32" />
          <stop offset="100%" stopColor="#E8A33D" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill={`url(#${gradientId})`} />
      <path
        d="M8 24C12.5 24 12.5 16 16 16C19.5 16 19.5 8 24 8"
        stroke="#FAFAF9"
        strokeWidth="2.25"
        strokeLinecap="round"
      />
      <circle cx="8" cy="24" r="1.75" fill="#FAFAF9" />
      <circle cx="24" cy="8" r="1.75" fill="#FAFAF9" />
    </svg>
  );
}

export function Logo({ className, markClassName, wordmarkClassName }: { className?: string; markClassName?: string; wordmarkClassName?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark className={cn("w-7 h-7 shrink-0", markClassName)} />
      <span className={cn("font-display text-lg text-ink tracking-tight", wordmarkClassName)}>Daythread</span>
    </span>
  );
}
