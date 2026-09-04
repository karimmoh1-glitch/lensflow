"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/Toaster";
import { setClientRelationship } from "@/app/actions/conversations";

const OPTIONS = [
  { key: "LEAD", label: "Potential", hint: "Hasn't bought yet" },
  { key: "CUSTOMER", label: "Customer", hint: "Has booked or paid" },
  { key: "CONTACT", label: "Contact", hint: "Known, not a client" },
] as const;

export function RelationshipControls({ clientId, relationship, name }: { clientId: string; relationship: "LEAD" | "CUSTOMER" | "CONTACT"; name: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();
  return (
    <div>
      <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink/45 mb-1.5">Relationship</div>
      <div role="radiogroup" aria-label="Relationship" className="inline-flex items-center rounded-full bg-black/[0.05] p-0.5">
        {OPTIONS.map((o) => {
          const on = o.key === relationship;
          return (
            <button
              key={o.key}
              type="button"
              role="radio"
              aria-checked={on}
              title={o.hint}
              disabled={pending || on}
              onClick={() =>
                start(async () => {
                  const r = await setClientRelationship(clientId, o.key);
                  if (r.error) return toast({ tone: "signal", title: "Couldn't change that", body: r.error });
                  toast({ tone: o.key === "CUSTOMER" ? "outcome" : "neutral", title: `${name.split(" ")[0]} moved to ${o.label}` });
                  router.refresh();
                })
              }
              className={cn("px-3 py-1 rounded-full text-xs font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50", on ? "bg-white text-ink shadow-xs" : "text-ink/55 hover:text-ink disabled:opacity-60")}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
