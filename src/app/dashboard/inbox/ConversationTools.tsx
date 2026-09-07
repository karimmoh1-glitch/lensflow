"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, EyeOff, Eye, Trash2, MoreHorizontal, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/Toaster";
import { markConversationRead, reclassifyConversation, removeConversationForMe, setClientRelationship, summarizeConversation } from "@/app/actions/conversations";
import type { ConversationSummary } from "@/lib/summarize";
import type { MessageCategory } from "@/lib/classifyMessage";

/**
 * The action rail. Appears on hover (and on focus, for keyboard users) on an inbox row, and
 * permanently in the thread header. Each action is real: Summarize generates and shows a
 * summary, Delete for me hides the conversation from Daythread with an Undo, Mark
 * read/unread flips the read state, More holds the classification corrections.
 */
export type ToolsProps = {
  conversationId: string;
  unread: boolean;
  category: MessageCategory;
  clientId?: string | null;
  relationship?: "LEAD" | "CUSTOMER" | "CONTACT" | null;
  /** Row rail (hover) or header rail (always visible). */
  variant?: "row" | "header";
  /** Called with the summary after Summarize (header only). */
  onSummary?: (s: ConversationSummary) => void;
};

export function ConversationTools({ conversationId, unread, category, clientId, relationship, variant = "row", onSummary }: ToolsProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  const stop = (e: React.SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  function summarize(e: React.SyntheticEvent) {
    stop(e);
    if (variant === "row") {
      router.push(`/dashboard/inbox?c=${conversationId}&summarize=1`);
      return;
    }
    startTransition(async () => {
      const r = await summarizeConversation(conversationId, { force: true });
      if (r.error) toast({ tone: "signal", title: "Couldn't summarize", body: r.error });
      else if (r.summary) {
        onSummary?.(r.summary);
        toast({ tone: "thinking", title: "Conversation summarized", body: r.summary.source === "ai" ? "Grounded in the messages." : "From the messages, no AI needed." });
      }
    });
  }

  function toggleRead(e: React.SyntheticEvent) {
    stop(e);
    startTransition(async () => {
      await markConversationRead(conversationId, unread);
      router.refresh();
    });
  }

  function remove(e: React.SyntheticEvent) {
    stop(e);
    startTransition(async () => {
      const r = await removeConversationForMe(conversationId, true);
      if (r.error) return toast({ tone: "signal", title: "Couldn't remove", body: r.error });
      toast({
        tone: "neutral",
        title: "Removed from Daythread",
        body: "Your email or messages are untouched.",
        ttl: 6000,
        action: {
          label: "Undo",
          onClick: () => {
            removeConversationForMe(conversationId, false).then(() => router.refresh());
          },
        },
      });
      if (variant === "header") router.push("/dashboard/inbox");
      else router.refresh();
    });
  }

  function reclassify(e: React.SyntheticEvent, to: MessageCategory) {
    stop(e);
    setMenu(false);
    startTransition(async () => {
      const r = await reclassifyConversation(conversationId, to);
      if (r.error) return toast({ tone: "signal", title: "Couldn't change that", body: r.error });
      toast({
        tone: to === "PRIORITY" ? "signal" : "thinking",
        title: to === "PRIORITY" ? "Moved to Priority" : "Moved out of Priority",
        body: r.ruleFor ? `Daythread will remember ${r.ruleFor}.` : undefined,
      });
      router.refresh();
    });
  }

  function relate(e: React.SyntheticEvent, to: "CUSTOMER" | "CONTACT") {
    stop(e);
    setMenu(false);
    if (!clientId) return;
    startTransition(async () => {
      const r = await setClientRelationship(clientId, to);
      if (r.error) return toast({ tone: "signal", title: "Couldn't change that", body: r.error });
      toast({ tone: to === "CUSTOMER" ? "outcome" : "neutral", title: to === "CUSTOMER" ? "Marked as a customer" : "Marked as a contact" });
      router.refresh();
    });
  }

  const btn = (label: string, onClick: (e: React.SyntheticEvent) => void, Icon: typeof Sparkles, tone?: "accent" | "signal") => (
    <button
      type="button"
      onClick={onClick}
      onKeyDown={(e) => e.key === "Enter" && onClick(e)}
      disabled={pending}
      aria-label={label}
      title={label}
      className={cn(
        "w-7 h-7 rounded-md flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
        variant === "header" ? "text-ink/55 hover:text-ink hover:bg-black/[0.05]" : "text-ink/45 hover:text-ink hover:bg-white shadow-none hover:shadow-xs",
        tone === "signal" && "hover:text-signal-text"
      )}
    >
      <Icon className="w-[15px] h-[15px]" strokeWidth={2} aria-hidden />
    </button>
  );

  return (
    <div
      ref={menuRef}
      className={cn("relative flex items-center", variant === "row" ? "gap-0.5 rounded-lg bg-paper/95 backdrop-blur px-0.5 py-0.5 border border-border/70" : "gap-1")}
      onClick={stop}
    >
      {btn("Summarize", summarize, Sparkles, "signal")}
      {btn(unread ? "Mark as read" : "Mark as unread", toggleRead, unread ? Eye : EyeOff)}
      {btn("Delete for me", remove, Trash2)}
      {btn("More", (e) => { stop(e); setMenu((m) => !m); }, MoreHorizontal)}
      {menu && (
        <div role="menu" className="absolute right-0 top-full mt-1 z-40 w-60 rounded-xl border border-border bg-white shadow-[0_18px_44px_-20px_rgba(16,17,20,0.35)] p-1 text-sm dt-land">
          <div className="px-2.5 pt-1.5 pb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-ink/40">Daythread put this in {label(category)}</div>
          {category !== "PRIORITY" ? (
            <Item onClick={(e) => reclassify(e, "PRIORITY")} title="Mark as priority" hint="A real person — show them in Priority" />
          ) : (
            <>
              <Item onClick={(e) => reclassify(e, "AUTOMATED")} title="Not priority" hint="Automated · kept in All, out of the way" />
              <Item onClick={(e) => reclassify(e, "PROMOTIONAL")} title="It's marketing" hint="Promotion" />
              <Item onClick={(e) => reclassify(e, "VENDOR")} title="It's a vendor" hint="A business you deal with, not a customer" />
            </>
          )}
          {clientId && (
            <>
              <div className="my-1 border-t border-border" />
              {relationship !== "CUSTOMER" && <Item onClick={(e) => relate(e, "CUSTOMER")} title="This is a customer" hint="They've bought from you" check />}
              {relationship !== "CONTACT" && <Item onClick={(e) => relate(e, "CONTACT")} title="Not a client" hint="Keep them, but out of the CRM" />}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Item({ onClick, title, hint, check }: { onClick: (e: React.SyntheticEvent) => void; title: string; hint?: string; check?: boolean }) {
  return (
    <button type="button" role="menuitem" onClick={onClick} className="w-full text-left rounded-lg px-2.5 py-2 hover:bg-black/[0.04] focus-visible:outline-none focus-visible:bg-black/[0.04]">
      <span className="flex items-center gap-2 text-sm font-semibold text-ink">
        {check && <Check className="w-3.5 h-3.5 text-success" strokeWidth={2.5} aria-hidden />}
        {title}
      </span>
      {hint && <span className="block text-[11px] text-ink/55">{hint}</span>}
    </button>
  );
}

function label(c: MessageCategory) {
  return { PRIORITY: "Priority", AUTOMATED: "Automated", PROMOTIONAL: "Promotions", VENDOR: "Vendors", INTERNAL: "Internal", SPAM: "Spam" }[c];
}

/** Marks the open conversation read once it's on screen. */
export function MarkReadOnOpen({ conversationId, unread }: { conversationId: string; unread: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!unread) return;
    markConversationRead(conversationId, true).then(() => router.refresh());
  }, [conversationId, unread, router]);
  return null;
}
