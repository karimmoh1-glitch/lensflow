import { cn } from "@/lib/utils";
import Link from "next/link";
import { Check } from "lucide-react";
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
  return <div className={cn("rounded-2xl border border-border bg-white shadow-popover", className)} {...props} />;
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5", className)} {...props} />;
}

export function Divider({ className }: { className?: string }) {
  return <hr className={cn("border-border", className)} />;
}

// ── Buttons ─────────────────────────────────────────────────────────────────

type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-ink text-white hover:bg-black",
  secondary: "bg-accent text-white hover:bg-accent/90",
  outline: "bg-white text-ink border border-border hover:bg-black/[0.03]",
  ghost: "bg-transparent text-ink/70 hover:bg-black/[0.05] hover:text-ink",
  danger: "bg-danger text-white hover:bg-danger/90",
};
const sizeClasses: Record<ButtonSize, string> = {
  sm: "text-[13px] h-8 px-3.5 rounded-full gap-1.5",
  md: "text-sm h-9 px-4 rounded-full gap-1.5",
  lg: "text-sm h-11 px-5 rounded-full gap-2",
};

/** The same physical hover-lift/press feel as every button on the marketing site — the
 * app should feel like the same product a visitor just saw, not a flatter internal tool. */
const PHYSICAL_FEEL =
  "transition-transform duration-150 hover:scale-[1.03] hover:-translate-y-0.5 active:scale-[0.97] active:translate-y-0";

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }>(
  function Button({ className, variant = "primary", size = "md", ...props }, ref) {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center font-medium transition-colors whitespace-nowrap shrink-0 disabled:opacity-45 disabled:pointer-events-none disabled:hover:scale-100 disabled:hover:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-1",
          PHYSICAL_FEEL,
          variantClasses[variant],
          sizeClasses[size],
          className
        )}
        {...props}
      />
    );
  }
);

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
        "inline-flex items-center justify-center font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
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
        "inline-flex items-center justify-center w-8 h-8 rounded-md text-ink/65 hover:text-ink hover:bg-black/[0.05] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
        className
      )}
      {...props}
    />
  );
}

// ── Form controls ─────────────────────────────────────────────────────────

const controlBase =
  "w-full rounded-md border border-border bg-white px-3 h-9 text-sm placeholder:text-ink/35 focus:outline-none focus:ring-2 focus:ring-accent/35 focus:border-accent/60 disabled:opacity-50 disabled:bg-black/[0.02]";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cn(controlBase, className)} {...props} />;
});

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
  neutral: "bg-black/[0.05] text-ink/60",
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
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium leading-5 whitespace-nowrap shrink-0",
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
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink/60">
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
    <div className="flex items-start justify-between gap-4 mb-7">
      <div>
        <h1 className="font-sans font-black text-page-title text-ink tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-ink/70">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 px-6 border border-dashed border-border rounded-xl">
      <p className="text-sm font-medium text-ink">{title}</p>
      {description && <p className="mt-1 text-sm text-ink/65 max-w-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-black/[0.06]", className)} aria-hidden />;
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
