import { RevealOnScroll } from "../RevealOnScroll";

/**
 * The "I get it" moment. Most tools hand you a dashboard and let you go looking.
 * Daythread's home starts with the one thing that needs you, then the day, then the money,
 * then the work — in that order, because that's the order you'd ask about them.
 * Composed like the real dashboard, with realistic data, no fabricated customers.
 */
export function OneThing() {
  return (
    <div className="max-w-6xl mx-auto px-6">
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] gap-10 lg:gap-16 items-center">
        <RevealOnScroll>
          <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-accent-text mb-4">The one thing</p>
          <h2 className="font-sans font-extrabold text-[clamp(2.2rem,4.8vw,3.9rem)] leading-[0.96] tracking-[-0.04em] text-ink text-balance">
            It tells you<br />what matters.
          </h2>
          <p className="mt-5 text-ink/60 text-base max-w-xs">Who needs you, what&rsquo;s today, what you&rsquo;re owed. In that order.</p>
        </RevealOnScroll>

        <RevealOnScroll delay={120}>
          <div className="rounded-[20px] border border-border bg-white shadow-[0_24px_64px_-24px_rgba(16,17,20,0.25)] overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3 border-b border-border bg-paper/70">
              <span className="text-sm font-extrabold text-ink tracking-tight">Home</span>
              <span className="ml-auto text-[11px] text-ink/50">Tuesday</span>
            </div>
            <div className="p-5 space-y-5">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-accent-text mb-2">Now</div>
                <div className="group flex items-center gap-4 rounded-2xl border border-accent/30 bg-gradient-to-br from-accent-soft/70 to-transparent px-4 py-4 transition-all duration-200 hover:border-accent/50 hover:-translate-y-0.5">
                  <div className="w-10 h-10 rounded-full bg-accent-soft text-accent-text flex items-center justify-center text-sm font-extrabold shrink-0">MC</div>
                  <div className="min-w-0 flex-1">
                    <div className="text-base font-extrabold text-ink tracking-tight">Maya replied 2 hours ago. She wants Tuesday.</div>
                    <div className="text-sm text-ink/65 mt-0.5">You haven&rsquo;t responded · Returning client · $350 session</div>
                  </div>
                  <span className="inline-flex items-center h-9 px-4 rounded-full bg-ink text-white text-xs font-extrabold shrink-0 transition-transform duration-150 group-hover:scale-105">Reply</span>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink/50 mb-2">Today</div>
                  <div className="space-y-1.5">
                    <Row time="10:00" name="Jordan Lee" what="Consult" status="Confirmed" tone="text-success-text" />
                    <Row time="3:00" name="Priya Patel" what="Full session" status="Balance due" tone="text-warning-text" />
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink/50 mb-2">Money</div>
                  <div className="grid grid-cols-2 gap-2">
                    <Stat label="Owed to you" value="$1,240" />
                    <Stat label="This month" value="$4,860" tone="text-success-text" />
                  </div>
                </div>
              </div>

              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink/50 mb-2">Work</div>
                <div className="flex items-center gap-2 text-xs">
                  {["New lead", "Follow-up", "Booked", "Paid", "Complete"].map((s, i) => (
                    <div key={s} className="flex items-center gap-2 flex-1 min-w-0">
                      <span className={`truncate font-semibold ${i === 2 ? "text-ink" : "text-ink/45"}`}>{s}</span>
                      <span className={`text-[10px] font-bold rounded-full px-1.5 py-px ${i === 2 ? "bg-ink text-white" : "bg-black/[0.05] text-ink/55"}`}>{[3, 2, 4, 1, 6][i]}</span>
                      {i < 4 && <span className="h-px flex-1 bg-border" />}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </RevealOnScroll>
      </div>
    </div>
  );
}

function Row({ time, name, what, status, tone }: { time: string; name: string; what: string; status: string; tone: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border px-3 py-2 text-sm transition-colors hover:bg-black/[0.02]">
      <span className="tabular-nums text-ink/50 text-xs w-10 shrink-0">{time}</span>
      <span className="font-semibold text-ink truncate">{name}</span>
      <span className="text-ink/50 truncate hidden sm:inline">· {what}</span>
      <span className={`ml-auto text-[11px] font-bold shrink-0 ${tone}`}>{status}</span>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-border px-3 py-2.5">
      <div className="text-[11px] text-ink/55">{label}</div>
      <div className={`font-sans font-extrabold text-xl tracking-tight tabular-nums ${tone ?? "text-ink"}`}>{value}</div>
    </div>
  );
}
