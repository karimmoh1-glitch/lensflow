import Link from "next/link";
import { cn } from "@/lib/utils";

export const focusRing = "rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/70 focus-visible:ring-offset-2";

/** An editorial section: the heading in a narrow left column, the content beside it. */
export function FounderSection({ id, title, lead, children, className }: { id: string; title: string; lead?: string; children: React.ReactNode; className?: string }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={cn("scroll-mt-6 border-t border-border py-14 md:py-20", className)}>
      <div className="grid gap-6 md:grid-cols-[220px_minmax(0,1fr)] md:gap-12">
        <div>
          <h2 id={`${id}-title`} className="font-serif text-display-sm text-ink">{title}</h2>
          {lead && <p className="mt-2 text-13 text-ink/65">{lead}</p>}
        </div>
        <div className="min-w-0">{children}</div>
      </div>
    </section>
  );
}

/** A small subheading inside a section. */
export function SubHeading({ children, id }: { children: React.ReactNode; id?: string }) {
  return <h3 id={id} className="text-section-title font-medium text-ink">{children}</h3>;
}

export function Prose({ paragraphs, className }: { paragraphs: string[]; className?: string }) {
  return (
    <div className={cn("max-w-[680px] space-y-4 text-[1.0625rem] leading-[1.7] text-ink/80", className)}>
      {paragraphs.map((p) => (
        <p key={p}>{p}</p>
      ))}
    </div>
  );
}

function isExternal(href: string) {
  return /^https?:\/\//.test(href);
}

/** A text link with an arrow: ↗ leaves the site, → stays on it. */
export function ArrowLink({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  const external = isExternal(href);
  const cls = cn(
    "group inline-flex min-h-10 items-center gap-1.5 text-sm font-medium text-ink",
    focusRing,
    className
  );
  const arrow = (
    <span aria-hidden className="shrink-0 text-ink/65 group-hover:text-ink">
      {external ? "↗" : "→"}
    </span>
  );
  return external ? (
    <a href={href} className={cls}>
      <span className="underline decoration-ink/25 underline-offset-4 transition-colors duration-fast group-hover:decoration-ink">{children}</span>
      {arrow}
    </a>
  ) : (
    <Link href={href} className={cls}>
      <span className="underline decoration-ink/25 underline-offset-4 transition-colors duration-fast group-hover:decoration-ink">{children}</span>
      {arrow}
    </Link>
  );
}

/** A spoken-and-drawn sequence: an ordered list whose items are joined by arrows on screen. */
export function Sequence({ steps, label, numbered = false }: { steps: string[]; label: string; numbered?: boolean }) {
  return (
    <ol aria-label={label} className="flex flex-wrap items-center gap-y-2 text-sm text-ink">
      {steps.map((s, i) => (
        <li key={s} className="flex items-center">
          <span className="inline-flex items-baseline gap-1.5 rounded border border-border bg-canvas px-2.5 py-1.5">
            {numbered && <span className="text-2xs tabular-nums text-ink/65">{String(i + 1).padStart(2, "0")}</span>}
            <span>{s}</span>
          </span>
          {i < steps.length - 1 && (
            <span aria-hidden className="px-2 text-ink/40">→</span>
          )}
        </li>
      ))}
    </ol>
  );
}
