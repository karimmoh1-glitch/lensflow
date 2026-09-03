"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const PROJECT_STAGES = ["Booked", "In progress", "Editing", "Review", "Ready", "Delivered"];

export function WorkflowCard({ step }: { step: number }) {
  return (
    <div className="w-80 sm:w-96 rounded-2xl border border-border bg-white shadow-popover overflow-hidden">
      <div className="px-5 py-3.5 border-b border-border flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
        <span className="font-display text-sm text-ink">Daythread</span>
      </div>
      <div key={step} className="p-6 min-h-[220px] flex flex-col justify-center animate-[fadeUp_0.35s_ease-out]">
        {step === 0 && (
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-accent-text">New lead</span>
              <span className="flex items-center gap-1 text-[10px] font-medium text-accent-text">
                <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                High intent
              </span>
            </div>
            <div className="text-sm font-medium text-ink mb-0.5">Sarah Johnson</div>
            <div className="text-[11px] text-ink/40 mb-2">Instagram</div>
            <p className="text-xs text-ink/60 italic">&quot;Are you available June 14?&quot;</p>
          </div>
        )}
        {step === 1 && (
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-info-text bg-info-soft rounded-full px-2 py-0.5">Booked</span>
            <div className="text-sm font-medium text-ink mt-2 mb-0.5">Sarah Johnson</div>
            <div className="text-[11px] text-ink/40 mb-3">Graduation Session · June 14</div>
            <div className="flex items-center justify-between rounded-lg bg-black/[0.03] px-3 py-2">
              <span className="text-xs text-ink/55">Total</span>
              <span className="text-sm font-display text-ink">$350</span>
            </div>
          </div>
        )}
        {step === 2 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-full bg-success-soft text-success flex items-center justify-center shrink-0">
                <Check className="w-3.5 h-3.5" strokeWidth={2.5} />
              </div>
              <span className="text-xs font-medium text-ink">Deposit received</span>
            </div>
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-ink/50">Paid</span>
              <span className="font-medium text-success">$105</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-ink/50">Remaining</span>
              <span className="font-medium text-ink">$245</span>
            </div>
          </div>
        )}
        {step === 3 && (
          <div>
            <div className="text-xs font-medium text-ink mb-3">Graduation Session — Sarah Johnson</div>
            <div className="space-y-1.5">
              {PROJECT_STAGES.map((stage, i) => (
                <div key={stage} className="flex items-center gap-2">
                  <div className={cn("w-4 h-4 rounded-full flex items-center justify-center shrink-0", i <= 4 ? "bg-ink" : "bg-black/10")}>
                    {i <= 4 && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                  </div>
                  <span className={cn("text-xs", i === 4 ? "text-ink font-medium" : i < 4 ? "text-ink/40" : "text-ink/30")}>{stage}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
