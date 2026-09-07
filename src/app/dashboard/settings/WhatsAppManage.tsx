"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, AlertTriangle, Phone } from "lucide-react";
import { Button } from "@/components/ui";
import { useToast } from "@/components/Toaster";
import { selectWhatsAppNumber } from "@/app/actions/connect";

/**
 * The WhatsApp connection in detail: which business account and number are live, what Meta
 * says about them, and — when Meta granted more than one — which number Daythread should
 * use. Choosing a number sends only its id; the server re-confirms ownership with Meta
 * before anything changes, so the browser's word is never enough.
 */
export type WhatsAppManageModel = {
  wabaId: string;
  wabaName: string | null;
  phoneNumberId: string;
  displayPhoneNumber: string;
  verifiedName: string;
  qualityRating: string | null;
  codeVerificationStatus: string | null;
  webhooksSubscribed: boolean;
  availableNumbers: Array<{ id: string; displayPhoneNumber: string; verifiedName: string; codeVerificationStatus?: string | null }>;
  templatesEnabled: boolean;
};

export function WhatsAppManage({ model }: { model: WhatsAppManageModel }) {
  const [pending, start] = useTransition();
  const [selected, setSelected] = useState(model.phoneNumberId);
  const router = useRouter();
  const { toast } = useToast();

  function choose(id: string) {
    if (id === model.phoneNumberId) return;
    setSelected(id);
    start(async () => {
      const r = await selectWhatsAppNumber(id);
      if (r.error) {
        setSelected(model.phoneNumberId);
        return toast({ tone: "signal", title: "Couldn't switch number", body: r.error });
      }
      toast({ tone: "outcome", title: "WhatsApp number updated", body: `Replies now send from ${r.displayPhoneNumber}.` });
      router.refresh();
    });
  }

  return (
    <div className="space-y-3 text-xs">
      <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1.5">
        <dt className="text-ink/65">Business account</dt>
        <dd className="text-ink/80 min-w-0 break-words">{model.wabaName ?? "WhatsApp Business Account"}</dd>
        <dt className="text-ink/65">Number</dt>
        <dd className="text-ink/80">{model.displayPhoneNumber} · {model.verifiedName}</dd>
        {model.qualityRating && (
          <>
            <dt className="text-ink/65">Quality</dt>
            <dd className="text-ink/80">{model.qualityRating.toLowerCase()}</dd>
          </>
        )}
        <dt className="text-ink/65">Verification</dt>
        <dd className="text-ink/80">{model.codeVerificationStatus === "VERIFIED" ? "Verified with Meta" : model.codeVerificationStatus ? model.codeVerificationStatus.toLowerCase().replace(/_/g, " ") : "Not reported by Meta"}</dd>
        <dt className="text-ink/65">Webhooks</dt>
        <dd className={model.webhooksSubscribed ? "text-success-text" : "text-warning-text"}>
          {model.webhooksSubscribed ? "Subscribed — messages and receipts arrive here" : "Not subscribed — reconnect to retry"}
        </dd>
      </dl>

      {model.availableNumbers.length > 1 && (
        <div>
          <p className="font-semibold text-ink/70 mb-1.5">Numbers Meta granted this workspace</p>
          <ul className="space-y-1.5">
            {model.availableNumbers.map((n) => {
              const active = n.id === selected;
              return (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => choose(n.id)}
                    disabled={pending}
                    aria-pressed={active}
                    className={`w-full text-left flex items-center gap-2.5 rounded-xl border px-3 py-2.5 transition-colors min-h-[44px] ${active ? "border-ink/25 bg-white" : "border-border hover:border-ink/20 bg-white/60"} disabled:opacity-60`}
                  >
                    <Phone className="w-3.5 h-3.5 shrink-0 text-ink/65" strokeWidth={2} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-ink truncate">{n.displayPhoneNumber}</span>
                      <span className="block text-[11px] text-ink/70 truncate">{n.verifiedName}{n.codeVerificationStatus === "VERIFIED" ? " · verified" : ""}</span>
                    </span>
                    {active && <Check className="w-4 h-4 shrink-0 text-success-text" strokeWidth={3} aria-hidden />}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="rounded-xl border border-warning/30 bg-warning-soft/40 px-3 py-2.5 flex gap-2">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-warning-text" strokeWidth={2} aria-hidden />
        <p className="text-[11px] text-ink/75 leading-relaxed">
          {model.templatesEnabled
            ? "Outside the 24-hour window Daythread sends an approved template."
            : "WhatsApp only allows a free-form reply within 24 hours of the customer's last message. Message templates aren't set up in Daythread yet, so a later reply is saved to the thread and clearly marked not delivered — never shown as sent."}
        </p>
      </div>

      <p className="text-[11px] text-ink/65">Disconnecting stops Meta delivering this number&rsquo;s events to Daythread and erases the stored credential. Your conversations and customers stay.</p>
    </div>
  );
}
