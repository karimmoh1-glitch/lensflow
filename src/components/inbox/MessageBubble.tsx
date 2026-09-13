import { cn } from "@/lib/utils";

/**
 * One message. Theirs sits left on a quiet grey; yours sits right on ink. Delivery is a
 * state, not decoration: a message that never left is amber-edged and says why; a failed
 * one is red-edged. The metadata line is the only place the timestamp lives.
 */
export type MessageStatus = "SENT" | "DELIVERED" | "READ" | "FAILED" | "NOT_DELIVERED" | "PENDING" | "DRAFT" | (string & {});

export function MessageBubble({ direction, status, meta, children, className, arrive }: { direction: "INBOUND" | "OUTBOUND"; status?: MessageStatus | null; meta?: React.ReactNode; children: React.ReactNode; className?: string; /** Animate in (a message that just landed). */ arrive?: boolean }) {
  const outbound = direction === "OUTBOUND";
  return (
    <div className={cn("max-w-[min(85%,28rem)]", outbound ? "ml-auto" : "", arrive && "dt-msg-in", className)}>
      <div
        className={cn(
          "rounded-2xl px-3.5 py-2.5 text-sm",
          status === "FAILED"
            ? "bg-danger-soft text-danger-text rounded-br border border-danger/25"
            : status === "NOT_DELIVERED"
              ? "bg-warning-soft text-ink rounded-br border border-warning/30"
              : outbound
                ? "bg-ink text-white rounded-br"
                : "bg-paper border border-border text-ink rounded-bl"
        )}
      >
        {children}
      </div>
      {meta && <div className={cn("text-xs text-ink/65 mt-1 px-1", outbound ? "text-right" : "")}>{meta}</div>}
    </div>
  );
}
