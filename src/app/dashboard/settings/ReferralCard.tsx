"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

/** The workspace's share link. Copying is the only action; nothing is sent anywhere. */
export function ReferralCard({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch {}
  };
  return (
    <section aria-labelledby="referral-title" className="rounded-[22px] border border-border bg-white px-5 py-5">
      <h2 id="referral-title" className="text-[15px] font-extrabold text-ink">Know another business that loses messages?</h2>
      <p className="mt-1 text-sm text-ink/65 leading-relaxed">Send them your link. When they start from it we can see the introduction came from you — nothing about you or them is shared, and nothing is charged.</p>
      <div className="mt-4 flex flex-col sm:flex-row gap-2">
        <input readOnly value={url} aria-label="Your referral link" onFocus={(e) => e.currentTarget.select()} className="flex-1 min-w-0 h-11 rounded-xl border border-border bg-paper px-3 text-sm text-ink font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50" />
        <button type="button" onClick={copy} className="inline-flex items-center justify-center gap-2 h-11 px-4 rounded-full bg-ink text-white text-sm font-bold hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50">
          {copied ? <><Check className="w-4 h-4" strokeWidth={2.5} aria-hidden />Copied</> : <><Copy className="w-4 h-4" strokeWidth={2} aria-hidden />Copy link</>}
        </button>
      </div>
    </section>
  );
}
