import { cn } from "@/lib/utils";
import Link from "next/link";
import { Check } from "lucide-react";
import { ThreadDots } from "@/components/brand/DaythreadLoader";
import { DaythreadMark } from "@/components/brand/DaythreadLogo";
import { forwardRef } from "react";
import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  LabelHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

// ── Surfaces ────────────────────────────────────────────────────────────────

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-xl border border-border bg-white shadow-surface", className)} {...props} />;
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5", className)} {...props} />;
}

export function Divider({ className }: { className?: string }) {
  return <hr className={cn("border-border", className)} />;
}

// ── Buttons ─────────────────────────────────────────────────────────────────

/**
 * Button hierarchy. One primary per view (ink). Secondary is a quiet filled neutral for the
 * second action. Outline and ghost for everything else. `brand` (coral) is reserved for the
 * single conversion action on marketing and upgrade surfaces — it is never a row action,
 * because in a product where coral also means "someone is waiting", a screen of coral
 * buttons reads as a screen of alarms.
 */
type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger" | "brand";
type ButtonSize = "sm" | "md" | "lg";

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-ink text-white hover:bg-black shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]",
  secondary: "bg-black/[0.05] text-ink hover:bg-black/[0.08]",
  outline: "bg-white text-ink border border-ink/[0.12] hover:border-ink/25 hover:bg-black/[0.02]",
  ghost: "bg-transparent text-ink/70 hover:bg-black/[0.05] hover:text-ink",
  danger: "bg-danger text-white hover:bg-danger/90",
  brand: "bg-accent-strong text-white hover:bg-accent-deep",
};
const sizeClasses: Record<ButtonSize, string> = {
  sm: "text-13 h-8 px-3 rounded-lg gap-1.5",
  md: "text-sm h-9 px-3.5 rounded-lg gap-1.5",
  lg: "text-sm h-10 px-4 rounded-[10px] gap-2",
};

/** Press feedback only: a one-pixel settle. No hover growth — controls that move when you
 * look at them feel like a demo, not a tool. */
const PHYSICAL_FEEL = "transition-[background-color,border-color,color,transform] duration-150 active:translate-y-px";

/** The product's own "working" signal inside buttons: a short thread travelling its path
 * (see components/brand/DaythreadLoader). Inherits the button's text color. */
export function WorkingDots({ className }: { className?: string }) {
  return <ThreadDots className={className} />;
}

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize; loading?: boolean; loadingLabel?: string }
>(function Button({ className, variant = "primary", size = "md", loading, loadingLabel, children, disabled, ...props }, ref) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "relative inline-flex items-center justify-center font-semibold whitespace-nowrap shrink-0 disabled:opacity-45 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/70 focus-visible:ring-offset-2",
        PHYSICAL_FEEL,
        variantClasses[variant],
        sizeClasses[size],
        loading && "opacity-90",
        className
      )}
      {...props}
    >
      {loading ? (
        <>
          <WorkingDots />
          {loadingLabel && <span className="ml-2">{loadingLabel}</span>}
        </>
      ) : (
        children
      )}
    </button>
  );
});

export function LinkButton({
  href,
  className,
  variant = "primary",
  size = "md",
  children,
  target,
}: {
  href: string;
  className?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: React.ReactNode;
  target?: string;
}) {
  return (
    <Link
      href={href}
      target={target}
      className={cn(
        "inline-flex items-center justify-center font-semibold whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/70 focus-visible:ring-offset-2",
        PHYSICAL_FEEL,
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
    >
      {children}
    </Link>
  );
}

/** A submit button with a built-in "Saved" acknowledgment state — used across every settings form. */
export function SaveButton({
  pending,
  saved,
  onClick,
  children,
}: {
  pending: boolean;
  saved: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button size="sm" disabled={pending} onClick={onClick}>
      {saved && <Check className="w-3.5 h-3.5" strokeWidth={2} />}
      {pending ? "Saving…" : saved ? "Saved" : children}
    </Button>
  );
}

export function IconButton({ className, "aria-label": ariaLabel, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { "aria-label": string }) {
  return (
    <button
      aria-label={ariaLabel}
      className={cn(
        "inline-flex items-center justify-center w-8 h-8 rounded-lg text-ink/65 hover:text-ink hover:bg-black/[0.05] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/70",
        className
      )}
      {...props}
    />
  );
}

// ── Form controls ─────────────────────────────────────────────────────────

// One control surface for the whole product. Rest: hairline border. Hover: the border
// darkens a step. Focus: a soft accent ring plus a solid accent border — visible without
// being loud. Invalid (aria-invalid): the danger border, same ring language in red.
export const controlBase =
  "w-full rounded-lg border border-ink/[0.14] bg-white px-3 h-10 text-sm text-ink placeholder:text-ink/60 transition-[border-color,box-shadow] duration-150 hover:border-ink/25 focus:outline-none focus:border-ink/50 focus:ring-[3px] focus:ring-ink/[0.08] aria-[invalid=true]:border-danger aria-[invalid=true]:focus:ring-danger/20 disabled:opacity-50 disabled:bg-black/[0.02] disabled:hover:border-ink/[0.14]";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cn(controlBase, className)} {...props} />;
});

/** A labelled control with an optional error, wired for assistive tech: the error is
 * announced, and the control is marked invalid. */
export function Field({
  id,
  label,
  hint,
  error,
  trailing,
  children,
}: {
  id: string;
  label: string;
  hint?: ReactNode;
  error?: string | null;
  trailing?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label htmlFor={id} className="block text-13 font-semibold text-ink/80">
          {label}
        </label>
        {trailing}
      </div>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-1.5 text-xs font-medium text-danger-text">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-xs text-ink/65">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** A form-level problem, stated like a person would: what happened, and where to go. */
export function FormError({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div role="alert" className="rounded-xl border border-danger/25 bg-danger-soft/60 px-3.5 py-3 text-sm text-danger-text dt-swap">
      <p>{children}</p>
      {action && <div className="mt-1.5 flex gap-4 text-13 font-semibold">{action}</div>}
    </div>
  );
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, ...props },
  ref
) {
  return <textarea ref={ref} className={cn(controlBase, "h-auto py-2 resize-none", className)} {...props} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, ...props }, ref) {
  return <select ref={ref} className={cn(controlBase, "pr-8", className)} {...props} />;
});

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("block text-xs font-medium text-ink/75 mb-1.5", className)} {...props} />;
}

// ── Status ──────────────────────────────────────────────────────────────────

type BadgeTone = "neutral" | "success" | "warning" | "danger" | "info" | "accent";
const badgeTones: Record<BadgeTone, string> = {
  neutral: "bg-black/[0.05] text-ink/65",
  success: "bg-success-soft text-success-text",
  warning: "bg-warning-soft text-warning-text",
  danger: "bg-danger-soft text-danger-text",
  info: "bg-info-soft text-info-text",
  accent: "bg-accent-soft text-accent-text",
};

export function Badge({ tone = "neutral", className, children }: { tone?: BadgeTone; className?: string; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 h-5 text-2xs font-semibold whitespace-nowrap shrink-0",
        badgeTones[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

/** A quieter alternative to a badge for signal that doesn't need a pill — a colored dot plus label. */
export function StatusDot({ tone = "neutral", label }: { tone?: BadgeTone; label: string }) {
  const dotColor: Record<BadgeTone, string> = {
    neutral: "bg-black/25",
    success: "bg-success",
    warning: "bg-warning",
    danger: "bg-danger",
    info: "bg-info",
    accent: "bg-accent",
  };
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink/65">
      <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", dotColor[tone])} />
      {label}
    </span>
  );
}

// ── Page structure ──────────────────────────────────────────────────────────

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4 mb-6">
      <div className="min-w-0">
        <h1 className="font-sans font-bold text-page-title text-ink">{title}</h1>
        {description && <p className="mt-1 text-sm text-ink/65">{description}</p>}
      </div>
      {action && <div className="sm:shrink-0 max-w-full">{action}</div>}
    </div>
  );
}

/**
 * The beginning of something, not a hole in the page. A short run of the thread with an
 * unlit node says "this will fill in"; the title says what belongs here; the description
 * says why it matters or what to do; the action (when there is one) does it.
 */
export function EmptyState({
  title,
  description,
  action,
  tone = "neutral",
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  tone?: "neutral" | "success" | "accent";
}) {
  const markColor = tone === "success" ? "text-success" : tone === "accent" ? "text-accent" : "text-ink/30";
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-6 rounded-xl border border-border bg-white">
      <div aria-hidden className={cn("mb-4 w-10 h-10 rounded-xl bg-paper border border-border flex items-center justify-center", markColor)}>
        <DaythreadMark className="w-5 h-5" node={tone === "neutral" ? "rgba(16,17,20,0.25)" : "#F0524D"} />
      </div>
      <p className="text-[15px] font-semibold text-ink tracking-[-0.005em]">{title}</p>
      {description && <p className="mt-1.5 text-sm text-ink/65 max-w-sm leading-relaxed">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Skeleton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={cn("animate-pulse rounded-md bg-black/[0.055]", className)} style={style} aria-hidden />;
}

/** A generic page-loading skeleton for route-level loading.tsx files — a header bar plus
 * a stack of card rows, close enough to most dashboard list pages to avoid a blank flash
 * without needing a bespoke skeleton per route. */
export function PageSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="max-w-4xl mx-auto px-6 md:px-8 py-8 md:py-10">
      <div className="flex items-center justify-between mb-7">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-9 w-28 rounded-md" />
      </div>
      <Card>
        <div className="divide-y divide-border">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-5 py-3.5">
              <Skeleton className="w-8 h-8 rounded-full shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3.5 w-1/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ── Numbers ─────────────────────────────────────────────────────────────────

/** One number that means something, with the words that make it mean it. Tone colors the
 * number only, so a row of tiles reads as a sentence, not a scoreboard. */
export function StatTile({ label, value, sub, tone = "neutral", href }: { label: string; value: string; sub?: string; tone?: "neutral" | "accent" | "success" | "warning" | "signal" | "danger"; href?: string }) {
  const color = { neutral: "text-ink", accent: "text-accent-text", success: "text-success-text", warning: "text-warning-text", signal: "text-ink/75", danger: "text-danger-text" }[tone];
  const body = (
    <>
      <div className={cn("font-sans font-bold text-2xl leading-none tracking-[-0.02em] tabular-nums", color)}>{value}</div>
      <div className="mt-1.5 text-13 font-medium text-ink">{label}</div>
      {sub && <div className="mt-0.5 text-xs text-ink/65 leading-snug">{sub}</div>}
    </>
  );
  const cls = "block bg-white px-5 py-4 min-w-0";
  return href ? <Link href={href} className={cn(cls, "hover:bg-black/[0.02] transition-colors")}>{body}</Link> : <div className={cls}>{body}</div>;
}

/** A section's eyebrow: small caps, optional hint, optional action on the right. */
export function SectionLabel({ children, hint, action, tone = "neutral" }: { children: ReactNode; hint?: string; action?: ReactNode; tone?: "neutral" | "accent" | "signal" | "success" }) {
  const color = { neutral: "text-ink/70", accent: "text-accent-text", signal: "text-ink/70", success: "text-success-text" }[tone];
  return (
    <div className="flex items-baseline gap-3 mb-2.5 px-1">
      <h2 className={cn("text-13 font-semibold", color)}>{children}</h2>
      {hint && <span className="text-xs text-ink/65">{hint}</span>}
      {action && <span className="ml-auto text-xs">{action}</span>}
    </div>
  );
}
