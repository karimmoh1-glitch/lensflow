"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, Check } from "lucide-react";
import { cn, initials } from "@/lib/utils";
import { useToast } from "@/components/Toaster";
import { assignConversation } from "@/app/actions/conversations";

export type Teammate = { membershipId: string; name: string; role: string };

/** Who owns this conversation. Business plan: pick a teammate; the row and the executive
 * view reflect it. */
export function AssignMenu({ conversationId, members, current }: { conversationId: string; members: Teammate[]; current: string | null }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { toast } = useToast();
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  const owner = members.find((m) => m.membershipId === current) ?? null;

  function pick(id: string | null) {
    setOpen(false);
    start(async () => {
      const r = await assignConversation(conversationId, id);
      if (r.error) return toast({ tone: "signal", title: "Couldn't assign", body: r.error });
      toast({ tone: "thinking", title: r.assignee ? `Assigned to ${r.assignee}` : "Unassigned" });
      router.refresh();
    });
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={pending}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={owner ? `Assigned to ${owner.name}` : "Assign to a teammate"}
        title={owner ? `Assigned to ${owner.name}` : "Assign"}
        className={cn("h-7 rounded-full flex items-center gap-1.5 px-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50", owner ? "bg-signal-soft text-signal-text hover:bg-signal-soft/70" : "text-ink/55 hover:text-ink hover:bg-black/[0.05]")}
      >
        {owner ? (
          <>
            <span className="w-5 h-5 rounded-full bg-signal text-white text-[9px] font-extrabold flex items-center justify-center">{initials(owner.name)}</span>
            <span className="hidden 2xl:inline pr-1">{owner.name.split(" ")[0]}</span>
          </>
        ) : (
          <UserPlus className="w-[15px] h-[15px]" strokeWidth={2} aria-hidden />
        )}
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full mt-1 z-40 w-56 rounded-xl border border-border bg-white shadow-[0_18px_44px_-20px_rgba(16,17,20,0.35)] p-1 text-sm dt-land">
          <div className="px-2.5 pt-1.5 pb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-ink/40">Owner</div>
          {members.map((m) => (
            <button key={m.membershipId} type="button" role="menuitemradio" aria-checked={m.membershipId === current} onClick={() => pick(m.membershipId)} className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-black/[0.04] focus-visible:outline-none focus-visible:bg-black/[0.04]">
              <span className="w-6 h-6 rounded-full bg-signal-soft text-signal-text text-[10px] font-extrabold flex items-center justify-center">{initials(m.name)}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-ink truncate">{m.name}</span>
                <span className="block text-[11px] text-ink/50">{m.role.charAt(0) + m.role.slice(1).toLowerCase()}</span>
              </span>
              {m.membershipId === current && <Check className="w-3.5 h-3.5 text-success" strokeWidth={2.5} aria-hidden />}
            </button>
          ))}
          {current && (
            <>
              <div className="my-1 border-t border-border" />
              <button type="button" role="menuitem" onClick={() => pick(null)} className="w-full rounded-lg px-2.5 py-2 text-left text-sm text-ink/70 hover:bg-black/[0.04]">Unassign</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
