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
          "rounded-[18px] px-4 py-2.5 text-[14px] leading-relaxed",
          status === "FAILED"
            ? "bg-danger-soft text-danger-text rounded-br-[6px] border border-danger/30"
            : status === "NOT_DELIVERED"
              ? "bg-warning-soft/60 text-ink rounded-br-[6px] border border-warning/40"
              : outbound
                ? "bg-ink text-white rounded-br-[6px]"
                : "bg-black/[0.05] text-ink rounded-bl-[6px]"
        )}
      >
        {children}
      </div>
      {meta && <div className={cn("text-[11px] text-ink/50 mt-1 px-1", outbound ? "text-right" : "")}>{meta}</div>}
    </div>
  );
}
