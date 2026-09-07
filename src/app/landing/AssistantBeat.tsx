"use client";

import { Sparkles, MessageSquare, CalendarCheck, RotateCcw, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { ChannelIcon } from "./ChannelIcon";
import { useScrollProgress, seg } from "./useScrollProgress";
import { Reveal } from "./Reveal";

/**
 * The assistant, doing what it does: it reads who is waiting, what isn't confirmed and who
 * went quiet, and puts the message in front of you, ready. As you scroll the first proposal
 * opens, you approve it, and it moves to done — nothing goes out on its own. Reversible;
 * reduced motion resolves to the approved state. Illustrative people, real mechanics.
 */
const PROPOSALS = [
  { icon: MessageSquare, kind: "Reply", title: "Reply to Maya Chen", why: "Waiting 2h · asked about Tuesday", tone: "text-accent-text bg-accent-soft" },
  { icon: CalendarCheck, kind: "Confirm", title: "Confirm Jordan's consult", why: "Friday 10:00 · not confirmed yet", tone: "text-success-text bg-success-soft" },
  { icon: RotateCcw, kind: "Follow up", title: "Follow up with Leo Studio", why: "Went quiet 5 days after your quote", tone: "text-signal-text bg-signal-soft" },
];

export function AssistantBeat() {
  const { ref, p } = useScrollProgress<HTMLDivElement>("enter", 0.3);
  const arrive = seg(p, 0.0, 0.2);
  const open = seg(p, 0.22, 0.42);
  const approve = seg(p, 0.48, 0.62);
  const done = seg(p, 0.66, 0.9);

  return (
    <div ref={ref} className="max-w-[1200px] mx-auto px-6">
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] gap-10 lg:gap-16 items-center">
        <Reveal>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-signal-text mb-4">Assistant</p>
          <h2 className="font-sans font-extrabold text-[clamp(2.4rem,4.4vw,3.9rem)] leading-[0.94] tracking-[-0.045em] text-ink">
            It proposes.<br />You approve.
          </h2>
          <p className="mt-5 text-ink/60 text-base max-w-sm">
            It reads what&rsquo;s actually happening — who&rsquo;s waiting, what isn&rsquo;t confirmed, who went quiet — and writes the next move from your real thread and prices. You read it. You send it. Nothing goes out on its own.
          </p>
        </Reveal>

        <div className="relative">
          <div className="rounded-[22px] border border-border bg-white shadow-[0_32px_80px_-32px_rgba(16,17,20,0.3)] overflow-hidden" style={{ opacity: 0.4 + arrive * 0.6, transform: `translateY(${(1 - arrive) * 12}px)` }}>
            <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-3">
              <div className="flex items-center gap-2"><span className="w-7 h-7 rounded-full bg-signal-soft text-signal-text flex items-center justify-center"><Sparkles className="w-3.5 h-3.5" strokeWidth={2} aria-hidden /></span><span className="text-sm font-extrabold text-ink">What I&rsquo;d do next</span></div>
              <div className="flex items-center gap-3 text-[11px] font-semibold text-ink/60">
                <span>Ready <span className="text-ink tabular-nums">{done > 0.5 ? 2 : 3}</span></span>
                <span>Done <span className="text-success-text tabular-nums">{done > 0.5 ? 1 : 0}</span></span>
              </div>
            </div>

            <ol className="divide-y divide-border">
              {PROPOSALS.map((pr, i) => {
                const first = i === 0;
                const Icon = pr.icon;
                const collapse = first ? done : 0;
                return (
                  <li key={pr.title} className="overflow-hidden" style={{ maxHeight: first ? `${Math.max(0, 1 - collapse) * 320}px` : undefined, opacity: first ? 1 - collapse : 1 }}>
                    <div className="px-5 py-3.5">
                      <div className="flex items-start gap-3">
                        <span className={cn("w-8 h-8 rounded-xl flex items-center justify-center shrink-0", pr.tone)}><Icon className="w-4 h-4" strokeWidth={2} aria-hidden /></span>
                        <div className="min-w-0 flex-1">
                          <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink/60">{pr.kind}</div>
                          <div className="text-sm font-semibold text-ink truncate">{pr.title}</div>
                          <div className="text-xs text-ink/60 truncate">{pr.why}</div>
                        </div>
                        <span className="text-[10px] font-bold uppercase tracking-wide text-success-text bg-success-soft px-2 py-1 rounded-md shrink-0 hidden sm:inline">Ready with your approval</span>
                      </div>
                      {first && (
                        <div className="overflow-hidden" style={{ maxHeight: `${open * 200}px`, opacity: open }}>
                          <div className="mt-3 ml-11 rounded-xl border border-border bg-paper px-3.5 py-3">
                            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-ink/60 mb-1.5"><ChannelIcon k="instagram" size={14} />Draft · Instagram</div>
                            <p className="text-[13px] text-ink leading-relaxed">Hi Maya — Tuesday afternoon works. 2:00 PM? A brand session is $350 and runs about 90 minutes. I&rsquo;ll hold it for you.</p>
                          </div>
                          <div className="mt-2.5 ml-11 flex items-center gap-3">
                            <span className="relative inline-flex items-center justify-center h-9 px-4 rounded-full bg-ink text-white text-[13px] font-semibold overflow-hidden" style={{ transform: `scale(${1 - (approve > 0 && approve < 1 ? Math.sin(approve * Math.PI) * 0.04 : 0)})` }}>
                              <span aria-hidden className="absolute inset-0 bg-success origin-left" style={{ transform: `scaleX(${approve})` }} />
                              <span className="relative flex items-center gap-1.5">{approve >= 1 ? <><Check className="w-3.5 h-3.5" strokeWidth={2.5} aria-hidden />Approved</> : "Approve & send"}</span>
                            </span>
                            <span className="text-xs text-ink/60">Edit</span>
                            <span className="text-xs text-ink/60 ml-auto">Not now</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>

            <div className="px-5 py-3 border-t border-border bg-paper/60">
              <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink/60 mb-1">Done today</div>
              <div className="flex items-center justify-between gap-3 overflow-hidden" style={{ maxHeight: `${done * 44}px`, opacity: done, transform: `translateY(${(1 - done) * -6}px)` }}>
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-5 h-5 rounded-full bg-success text-white flex items-center justify-center shrink-0"><Check className="w-3 h-3" strokeWidth={3} aria-hidden /></span>
                  <span className="text-sm text-ink truncate">Replied to Maya Chen <span className="text-ink/60">· Instagram</span></span>
                </div>
                <span className="text-[11px] font-bold text-success-text shrink-0">just now</span>
              </div>
              <p className="text-[11px] text-ink/60 mt-1.5" style={{ opacity: 1 - done }}>Nothing here yet — approve something above.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
