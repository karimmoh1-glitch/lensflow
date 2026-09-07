import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Daythread's one structural idea, as a component: a business is a thread of connected
 * events. Four kinds, each with the meaning the brand colors already carry —
 *
 *   signal   coral   something arrived that matters (a message, a new lead)
 *   thinking violet  the system read it (a note, an automation, a draft)
 *   state    ink     where a thing currently stands (a booking, a pending payment)
 *   outcome  green   it resolved (paid, delivered, done)
 *
 * Deliberately not a "railroad": one hairline, small nodes, no glow. The reading is
 * "everything connects," not "they like drawing lines." Used by the client relationship
 * timeline, the inbox context rail, and automation activity — the same thread everywhere.
 */
export type ThreadKind = "signal" | "thinking" | "state" | "outcome" | "note";

const NODE: Record<ThreadKind, string> = {
  signal: "bg-accent",
  thinking: "bg-signal",
  state: "bg-ink/70",
  outcome: "bg-success",
  note: "bg-ink/25",
};

export function Thread({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <ol className={cn("relative pl-7 min-w-0", className)}>
      <span aria-hidden className="absolute left-[7px] top-2 bottom-2 w-px bg-border" />
      {children}
    </ol>
  );
}

export function ThreadNode({
  kind,
  title,
  meta,
  when,
  href,
  children,
}: {
  kind: ThreadKind;
  title: React.ReactNode;
  meta?: React.ReactNode;
  when?: string;
  href?: string;
  children?: React.ReactNode;
}) {
  const body = (
    <>
      <span aria-hidden className={cn("absolute -left-7 top-[7px] w-[15px] h-[15px] rounded-full border-[3px] border-paper", NODE[kind])} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium text-ink truncate">{title}</div>
          {meta && <div className="text-xs text-ink/65 mt-0.5 truncate">{meta}</div>}
        </div>
        {when && <div className="text-[11px] text-ink/50 tabular-nums shrink-0 mt-0.5">{when}</div>}
      </div>
      {children}
    </>
  );
  return (
    <li className="relative py-2.5">
      {href ? (
        <Link href={href} className="block -mx-2 px-2 rounded-lg hover:bg-black/[0.03] transition-colors">
          {body}
        </Link>
      ) : (
        body
      )}
    </li>
  );
}

/** The ACTION primitive: the one thing to do next, stated plainly with a way to do it. */
export function NextAction({ title, why, href, cta }: { title: string; why?: string; href: string; cta: string }) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-2xl border border-accent/25 bg-gradient-to-br from-accent-soft/60 to-transparent px-4 py-3.5 transition-colors hover:border-accent/40"
    >
      <span aria-hidden className="w-2 h-2 rounded-full bg-accent shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-ink">{title}</div>
        {why && <div className="text-xs text-ink/65 mt-0.5">{why}</div>}
      </div>
      <span className="text-xs font-bold text-accent-text shrink-0 group-hover:translate-x-0.5 transition-transform">{cta} →</span>
    </Link>
  );
}
