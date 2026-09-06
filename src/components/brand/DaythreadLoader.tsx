import styles from "./DaythreadLoader.module.css";
import { cn } from "@/lib/utils";

/**
 * "Daythread is bringing everything together." A single thread travels through the five
 * points of a business — inbox, calendar, bookings, automation, the business itself — and
 * settles into the mark's coral node. SVG + CSS only; respects reduced motion (static
 * connected state); announces itself to assistive tech once via role="status".
 *
 * Use it for the first authenticated paint, a page that is genuinely being assembled, an
 * integration connecting, or an operation the person is waiting on. Not for every fetch.
 */
export function DaythreadLoader({ label = "Bringing everything together", size = 160, className, quiet }: { label?: string; size?: number; className?: string; quiet?: boolean }) {
  return (
    <div className={cn(styles.wrap, className)} role="status" aria-live="polite" aria-label={label}>
      <svg className={styles.svg} width={size} height={Math.round(size * 0.45)} viewBox="0 0 160 72" fill="none" aria-hidden>
        <path className={styles.rail} d="M8 36C30 36 34 14 56 14S78 58 100 58 122 36 144 36" strokeWidth="2" strokeLinecap="round" />
        <path className={styles.thread} d="M8 36C30 36 34 14 56 14S78 58 100 58 122 36 144 36" strokeWidth="2.5" strokeLinecap="round" />
        <circle className={styles.node} cx="8" cy="36" r="3" />
        <circle className={styles.node} cx="56" cy="14" r="3" />
        <circle className={styles.node} cx="78" cy="36" r="3" />
        <circle className={styles.node} cx="100" cy="58" r="3" />
        <circle className={styles.node} cx="128" cy="40" r="3" />
        <circle className={styles.end} cx="150" cy="36" r="5" />
      </svg>
      {!quiet && <span className={styles.label}>{label}</span>}
    </div>
  );
}

/** Button-sized thread: the same motion at 18px, inheriting the text color. */
export function ThreadDots({ className }: { className?: string }) {
  return (
    <svg className={cn(styles.mini, className)} width="22" height="12" viewBox="0 0 44 24" fill="none" aria-hidden>
      <path className={styles.rail} d="M3 12C10 12 11 4 18 4S26 20 33 20 40 12 41 12" strokeWidth="3" strokeLinecap="round" />
      <path className={styles.thread} d="M3 12C10 12 11 4 18 4S26 20 33 20 40 12 41 12" strokeWidth="3.5" strokeLinecap="round" />
    </svg>
  );
}
