"use client";

import { cn } from "@/lib/utils";
import { ChannelIcon } from "./ChannelIcon";
import { Beat, Arrow } from "./ProductDemo";
import { useScrollProgress, seg } from "./useScrollProgress";

/**
 * An automation, shown firing — and you're the one firing it, with the scroll wheel.
 * A booking lands → WHEN lights → IF evaluates → THEN acts → the confirmation goes out on
 * the client's own channel and lands in the log. Scroll back and it un-fires. Reduced
 * motion: the fired state.
 */
export function Workflow() {
  const { ref, p } = useScrollProgress<HTMLDivElement>("enter", 0.25);
  const arrive = seg(p, 0.0, 0.22);
  const when = seg(p, 0.22, 0.38);
  const cond = seg(p, 0.38, 0.54);
  const then = seg(p, 0.54, 0.7);
  const sent = seg(p, 0.72, 0.9);

  return (
    <div ref={ref} className="max-w-[1200px] mx-auto px-6">
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] gap-10 lg:gap-16 items-center">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-signal-text mb-4">Runs itself</p>
          <h2 className="font-sans font-extrabold text-[clamp(2.4rem,4.4vw,3.9rem)] leading-[0.94] tracking-[-0.045em] text-ink">
            The boring part,<br /><span className="whitespace-nowrap">done for you.</span>
          </h2>
          <p className="mt-5 text-ink/60 text-base max-w-xs">A sentence you can read. Scroll, and watch it fire.</p>
        </div>

        <div className="relative">
          {/* the trigger: a booking arriving */}
          <div className="absolute -top-5 left-4 z-10 w-[min(280px,80%)]" style={{ opacity: arrive, transform: `translateY(${(1 - arrive) * 14}px)` }}>
            <div className="flex items-center gap-2.5 rounded-2xl border border-border bg-white shadow-popover px-3 py-2.5">
              <ChannelIcon k="whatsapp" size={30} />
              <div className="min-w-0">
                <div className="text-xs font-semibold text-ink">Sarah Kim booked</div>
                <div className="text-[11px] text-ink/60 truncate">Brand session · Fri 2:30 PM</div>
              </div>
              <span className="ml-auto w-2 h-2 rounded-full bg-accent shrink-0" style={{ opacity: when < 1 ? 1 : 0.3 }} />
            </div>
          </div>

          <div className="rounded-[22px] border border-border bg-white shadow-[0_32px_80px_-32px_rgba(16,17,20,0.3)] overflow-hidden pt-8">
            <div className="px-5 py-4 border-b border-border">
              <div className="flex items-center justify-between gap-3 mb-3">
                <span className="text-sm font-semibold text-ink">Booking confirmation</span>
                <span className="flex items-center gap-1.5 text-[11px] font-bold text-success-text"><span className="w-1.5 h-1.5 rounded-full bg-success" />On</span>
              </div>
              <div className="grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-2">
                <Lit t={when} color="rgba(240,82,77,0.4)"><Beat label="When" tone="signal" text="a booking is created" /></Lit>
                <Arrow />
                <Lit t={cond} color="rgba(109,90,230,0.4)"><Beat label="If" tone="thinking" text="right away" /></Lit>
                <Arrow />
                <Lit t={then} color="rgba(30,142,90,0.4)"><Beat label="Then" tone="outcome" text="send a confirmation" /></Lit>
              </div>
              <div className="mt-3 flex items-start gap-2" style={{ opacity: 0.35 + then * 0.65, transform: `translateY(${(1 - then) * 4}px)` }}>
                <ChannelIcon k="whatsapp" size={18} />
                <p className="text-xs text-ink/70 leading-relaxed">“Hi Sarah — you&rsquo;re booked for Friday at 2:30. A 30% deposit holds the date; the link is below.”</p>
              </div>
            </div>
            <div className="px-5 py-3">
              <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink/45 mb-1">Recently ran</div>
              <ol className="relative pl-6">
                <span aria-hidden className="absolute left-[5px] top-2 bottom-2 w-px bg-border" />
                <li className="relative" style={{ opacity: sent }}>
                  <span aria-hidden className="absolute -left-6 top-[13px] w-[11px] h-[11px] rounded-full border-2 border-white bg-success transition-transform duration-300" style={{ transform: `scale(${sent})` }} />
                  <div className="flex items-start justify-between gap-3 overflow-hidden" style={{ maxHeight: sent * 52, transform: `translateY(${(1 - sent) * -8}px)` }}>
                    <div className="min-w-0 py-2"><div className="text-sm font-medium text-ink truncate">Booking confirmation</div><div className="text-xs text-ink/60 truncate">Sent · Sarah Kim · WhatsApp</div></div>
                    <div className="text-[11px] font-bold text-success-text shrink-0 py-2">just now</div>
                  </div>
                </li>
                {[
                  ["bg-success", "Session reminder", "Sent · Maya Chen · Messages", "yesterday"],
                  ["bg-success", "Booking confirmation", "Sent · Priya Patel · email", "3 days ago"],
                  ["bg-ink/25", "Thank-you + review", "Skipped · already reviewed", "5 days ago"],
                ].map(([dot, t, m, w]) => (
                  <li key={t + w} className="relative py-2 flex items-start justify-between gap-3">
                    <span aria-hidden className={`absolute -left-6 top-[13px] w-[11px] h-[11px] rounded-full border-2 border-white ${dot}`} />
                    <div className="min-w-0"><div className="text-sm font-medium text-ink truncate">{t}</div><div className="text-xs text-ink/60 truncate">{m}</div></div>
                    <div className="text-[11px] text-ink/45 shrink-0">{w}</div>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Lit({ t, color, children }: { t: number; color: string; children: React.ReactNode }) {
  return (
    <div className={cn("rounded-xl transition-transform duration-200")} style={{ boxShadow: `0 0 0 ${t * 2}px ${color}`, transform: `scale(${1 + (t > 0 && t < 1 ? Math.sin(t * Math.PI) * 0.03 : 0)})`, opacity: 0.55 + t * 0.45 }}>
      {children}
    </div>
  );
}
