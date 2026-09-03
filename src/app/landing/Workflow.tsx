import { RevealOnScroll } from "../RevealOnScroll";
import { Beat, Arrow } from "./ProductDemo";

/**
 * The part of the business that runs itself. One automation, read as a sentence, and the
 * proof that it ran — on the same thread grammar as everything else. Short on purpose:
 * the demo above already lets you flip the switches.
 */
export function Workflow() {
  return (
    <div className="max-w-6xl mx-auto px-6">
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-10 lg:gap-16 items-center">
        <RevealOnScroll>
          <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-signal-text mb-4">Runs itself</p>
          <h2 className="font-sans font-extrabold text-[clamp(2.2rem,4.8vw,3.9rem)] leading-[0.96] tracking-[-0.04em] text-ink text-balance">
            Reminders that<br />send themselves.
          </h2>
          <p className="mt-5 text-ink/60 text-base max-w-xs">Written as a sentence. No flowcharts.</p>
        </RevealOnScroll>
        <RevealOnScroll delay={120}>
          <div className="rounded-[20px] border border-border bg-white shadow-[0_24px_64px_-24px_rgba(16,17,20,0.25)] overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <div className="flex items-center justify-between gap-3 mb-3">
                <span className="text-sm font-semibold text-ink">Session reminder</span>
                <span className="text-[11px] font-bold text-success-text">On</span>
              </div>
              <div className="grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-2">
                <Beat label="When" tone="signal" text="a booking is coming up" /><Arrow /><Beat label="If" tone="thinking" text="1 day before" /><Arrow /><Beat label="Then" tone="outcome" text="send a reminder" />
              </div>
              <p className="text-xs text-ink/55 mt-3 truncate"><span className="text-ink/40">Sends:</span> “Hi Maya — see you tomorrow at 2:00. Reply here if anything changes.”</p>
            </div>
            <div className="px-5 py-3">
              <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink/45 mb-1">Recently ran</div>
              <ol className="relative pl-6">
                <span aria-hidden className="absolute left-[5px] top-2 bottom-2 w-px bg-border" />
                {[
                  ["bg-success", "Session reminder", "Sent · Maya Chen · SMS", "yesterday"],
                  ["bg-success", "Booking confirmation", "Sent · Priya Patel · Messenger", "3 days ago"],
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
        </RevealOnScroll>
      </div>
    </div>
  );
}
