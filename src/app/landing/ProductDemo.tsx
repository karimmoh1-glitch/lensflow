"use client";

import { useState } from "react";
import { Inbox, Users, CalendarClock, Zap, Home, CreditCard, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { ChannelIcon, type ChannelKey } from "./ChannelIcon";

/**
 * A miniature Daythread you can click — one application transforming, not six tabs
 * swapping. Every surface is built from the product's own grammar and real concepts:
 * the inbox with its context rail, a client as a relationship timeline, a booking with its
 * money attached, payments with statuses, automations that read as WHEN → IF → THEN and
 * actually toggle, and Copilot answering the questions it really answers. The frame
 * stays; the content settles in; the atmosphere shifts to the surface's color.
 */
type Tab = "inbox" | "client" | "booking" | "payments" | "automation" | "ai";

const TABS: { key: Tab; label: string; icon: typeof Inbox; hint: string; tint: string }[] = [
  { key: "inbox", label: "Inbox", icon: Inbox, hint: "Click a conversation — the context appears.", tint: "#F0524D" },
  { key: "client", label: "Client", icon: Users, hint: "A client is a history, not a row.", tint: "#6D5AE6" },
  { key: "booking", label: "Booking", icon: CalendarClock, hint: "The booking carries its own money.", tint: "#101114" },
  { key: "payments", label: "Payments", icon: CreditCard, hint: "What's paid, what's owed, matched to bookings.", tint: "#1E8E5A" },
  { key: "automation", label: "Automations", icon: Zap, hint: "Turn one on. It reads like a sentence.", tint: "#6D5AE6" },
  { key: "ai", label: "Copilot", icon: Sparkles, hint: "Ask it what needs you today.", tint: "#6D5AE6" },
];

const CONVOS: { id: string; name: string; ch: ChannelKey; msg: string; when: string; tag: string; tagTone: string; score: number; status: string; ltv: string; mention: [string, string][]; history: string[] }[] = [
  { id: "maya", name: "Maya Chen", ch: "instagram", msg: "Hey! Are you free Tuesday afternoon?", when: "2h", tag: "Needs reply", tagTone: "text-accent-text", score: 82, status: "Returning client", ltv: "$2,150", mention: [["Service", "Brand session"], ["Date", "Tuesday PM"]], history: ["Brand session · Mar · paid $700", "Headshots · Nov · paid $350"] },
  { id: "jordan", name: "Jordan Lee", ch: "gmail", msg: "Following up on pricing for a September date.", when: "9d", tag: "Going cold", tagTone: "text-warning-text", score: 61, status: "Warm lead", ltv: "—", mention: [["Service", "Full package"], ["Date", "September"]], history: ["First inquiry · 9 days ago"] },
  { id: "sam", name: "Sam Okafor", ch: "whatsapp", msg: "Can we move Thursday to 4pm?", when: "1d", tag: "Booked", tagTone: "text-success-text", score: 88, status: "Client · booked Thu", ltv: "$180", mention: [["Service", "Consult"], ["Date", "Thu 4:00 PM"]], history: ["Consult · Thu · deposit paid"] },
  { id: "priya", name: "Priya Patel", ch: "website", msg: "Booked the Full package for Sep 18.", when: "2d", tag: "Deposit paid", tagTone: "text-success-text", score: 91, status: "New client · booking page", ltv: "$540", mention: [["Service", "Full package"], ["Date", "Sep 18"]], history: ["Full package · Sep 18 · $540 deposit paid"] },
  { id: "lead", name: "(512) 555-0148", ch: "sms", msg: "Do you have anything open next week?", when: "3d", tag: "Link sent", tagTone: "text-signal-text", score: 54, status: "New lead", ltv: "—", mention: [["Date", "Next week"]], history: ["Booking link sent · viewed"] },
];

export function ProductDemo() {
  const [tab, setTab] = useState<Tab>("inbox");
  const [convo, setConvo] = useState("maya");
  const [autos, setAutos] = useState<Record<string, boolean>>({ confirm: true, remind: true, thanks: false });
  const [asked, setAsked] = useState<string | null>(null);
  const active = TABS.find((t) => t.key === tab)!;
  const c = CONVOS.find((x) => x.id === convo)!;

  return (
    <div className="relative max-w-[1200px] mx-auto px-6">
      <div aria-hidden className="absolute inset-x-0 top-1/3 h-2/3 -z-0 pointer-events-none transition-all duration-1000" style={{ background: `radial-gradient(50% 50% at 50% 60%, ${active.tint}1a, transparent 70%)` }} />

      <div className="relative text-center max-w-2xl mx-auto mb-8">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink/45 mb-4">Try it</p>
        <h2 className="font-sans font-extrabold text-[clamp(2.4rem,5vw,4.25rem)] leading-[0.94] tracking-[-0.045em] text-ink">Click around.</h2>
      </div>

      <div className="relative flex flex-wrap items-center justify-center gap-2 mb-4" role="tablist" aria-label="Product surfaces">
        {TABS.map((t) => {
          const on = t.key === tab;
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={on}
              onClick={() => setTab(t.key)}
              className={cn(
                "inline-flex items-center gap-2 h-10 px-4 rounded-full text-sm font-bold transition-all duration-200 ease-[cubic-bezier(0.22,1.2,0.36,1)] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
                on ? "bg-ink text-white shadow-sm scale-[1.03]" : "bg-white text-ink/70 border border-border hover:text-ink hover:border-ink/20 hover:-translate-y-px"
              )}
            >
              <t.icon className="w-4 h-4" strokeWidth={2} />
              {t.label}
            </button>
          );
        })}
      </div>
      <p className="relative text-center text-sm text-ink/55 mb-6 h-5" aria-live="polite">{active.hint}</p>

      {/* The window */}
      <div className="relative rounded-[24px] border border-border bg-white shadow-[0_40px_100px_-40px_rgba(16,17,20,0.4),0_2px_6px_rgba(16,17,20,0.05)] overflow-hidden grid grid-cols-1 md:grid-cols-[176px_minmax(0,1fr)] min-h-[460px] transition-shadow duration-700" style={{ boxShadow: `0 40px 100px -40px ${active.tint}66, 0 2px 6px rgba(16,17,20,0.05)` }}>
        {/* Sidebar */}
        <aside className="hidden md:flex flex-col border-r border-border bg-paper/70 py-4 px-3 gap-0.5">
          <div className="flex items-center gap-2 px-2 pb-4">
            <svg viewBox="0 0 24 24" className="w-5 h-5 text-ink" fill="none"><path d="M4 18C9 18 9 6 15 6C17 6 18.5 7.5 20 9" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" /></svg>
            <span className="text-sm font-extrabold tracking-tight text-ink">Daythread</span>
          </div>
          {[
            { k: "home", label: "Home", icon: Home },
            { k: "inbox", label: "Inbox", icon: Inbox, n: 3 },
            { k: "client", label: "Clients", icon: Users },
            { k: "booking", label: "Bookings", icon: CalendarClock },
            { k: "payments", label: "Payments", icon: CreditCard },
            { k: "automation", label: "Automations", icon: Zap },
            { k: "ai", label: "Copilot", icon: Sparkles },
          ].map((i) => {
            const on = i.k === tab;
            const clickable = TABS.some((t) => t.key === i.k);
            return (
              <button
                key={i.k}
                type="button"
                disabled={!clickable}
                onClick={() => clickable && setTab(i.k as Tab)}
                className={cn("flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-semibold text-left transition-all duration-200", on ? "bg-ink text-white" : clickable ? "text-ink/70 hover:bg-black/[0.04] hover:translate-x-0.5" : "text-ink/40 cursor-default")}
              >
                <i.icon className="w-4 h-4 shrink-0" strokeWidth={2} />
                {i.label}
                {i.n && <span className={cn("ml-auto text-[10px] font-bold rounded-full px-1.5", on ? "bg-white/20 text-white" : "bg-accent text-white")}>{i.n}</span>}
              </button>
            );
          })}
        </aside>

        {/* Main */}
        <div key={tab} className="dt-swap min-w-0">
          {tab === "inbox" && (
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_270px] h-full">
              <div className="divide-y divide-border">
                <div className="px-5 py-3 flex items-center gap-2">
                  <span className="text-sm font-extrabold text-ink">Inbox</span>
                  <span className="text-[11px] text-ink/50">Sorted by what needs you</span>
                </div>
                {CONVOS.map((x) => {
                  const on = x.id === convo;
                  return (
                    <button key={x.id} type="button" onClick={() => setConvo(x.id)} className={cn("w-full text-left px-5 py-3.5 flex gap-3 transition-all duration-200", on ? "bg-accent-soft/40" : "hover:bg-black/[0.02] hover:translate-x-0.5")}>
                      <ChannelIcon k={x.ch} size={36} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2"><span className="text-sm font-semibold text-ink truncate">{x.name}</span><span className="text-[10px] text-ink/45">· {x.when}</span></span>
                        <span className="block text-xs text-ink/70 truncate">{x.msg}</span>
                        <span className={cn("block text-[11px] font-bold mt-0.5", x.tagTone)}>{x.tag}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
              <div key={convo} className="dt-swap border-t lg:border-t-0 lg:border-l border-border bg-paper/60 p-5">
                <div className="flex items-center gap-3">
                  <span className="w-10 h-10 rounded-full bg-signal-soft text-signal-text flex items-center justify-center text-xs font-extrabold">{c.name.split(" ").map((p) => p[0]).join("")}</span>
                  <div><div className="text-sm font-extrabold text-ink">{c.name}</div><div className="text-[11px] text-ink/60">{c.status}</div></div>
                </div>
                <div className="mt-3 flex items-center gap-2 text-[11px]"><span className="rounded-full bg-success-soft text-success-text font-bold px-2 py-0.5">{c.score}/100</span><span className="text-ink/55">Lifetime {c.ltv}</span></div>
                <div className="mt-4 text-[10px] font-bold uppercase tracking-[0.12em] text-ink/45">They mentioned</div>
                <dl className="mt-1.5 space-y-1 text-xs">{c.mention.map(([k, v]) => <div key={k} className="flex justify-between"><dt className="text-ink/55">{k}</dt><dd className="font-semibold text-ink">{v}</dd></div>)}</dl>
                <div className="mt-4 text-[10px] font-bold uppercase tracking-[0.12em] text-ink/45">History</div>
                <ol className="relative mt-1.5 pl-5 space-y-2 text-xs text-ink/75"><span aria-hidden className="absolute left-[5px] top-1.5 bottom-1.5 w-px bg-border" />{c.history.map((h) => <li key={h} className="relative"><span aria-hidden className="absolute -left-5 top-[5px] w-[11px] h-[11px] rounded-full border-2 border-paper bg-success" />{h}</li>)}</ol>
              </div>
            </div>
          )}

          {tab === "client" && (
            <div className="p-5 md:p-6">
              <div className="flex items-center gap-4 mb-5">
                <span className="w-12 h-12 rounded-full bg-accent-soft text-accent-text flex items-center justify-center text-sm font-extrabold">MC</span>
                <div className="min-w-0"><div className="text-lg font-extrabold text-ink tracking-tight">Maya Chen</div><div className="text-xs text-ink/60">maya@hey.com · @maya.makes</div></div>
                <div className="ml-auto text-right"><div className="text-[11px] text-ink/55">Lifetime</div><div className="text-xl font-extrabold text-ink tabular-nums">$2,150</div></div>
              </div>
              <div className="group flex items-center gap-3 rounded-2xl border border-accent/30 bg-gradient-to-br from-accent-soft/70 to-white px-4 py-3 mb-5 transition-all hover:-translate-y-px hover:border-accent/50">
                <span className="w-2 h-2 rounded-full bg-accent shrink-0" /><div className="min-w-0 flex-1"><div className="text-sm font-semibold text-ink">Reply to Maya</div><div className="text-xs text-ink/65">Waiting 2 hours · $350 opportunity</div></div><span className="text-xs font-bold text-accent-text transition-transform group-hover:translate-x-0.5">Reply →</span>
              </div>
              <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink/45 mb-2">Relationship</div>
              <ol className="relative pl-7">
                <span aria-hidden className="absolute left-[7px] top-2 bottom-2 w-px bg-border" />
                {[
                  ["bg-accent", "Conversation on Instagram", "“Are you free Tuesday afternoon?”", "Today"],
                  ["bg-signal", "Note · you", "Prefers afternoons. Mentioned a fall launch.", "Mar 14"],
                  ["bg-success", "Balance · $350", "Paid", "Mar 12"],
                  ["bg-success", "Brand session", "completed · Wed, Mar 12 · 2:00 PM", "Mar 12"],
                  ["bg-success", "Deposit · $350", "Paid", "Feb 28"],
                  ["bg-ink/70", "Headshots", "completed · Nov 4", "Nov 4"],
                ].map(([dot, title, meta, when]) => (
                  <li key={title + when} className="relative py-2 hover:bg-black/[0.02] -mx-2 px-2 rounded-lg transition-colors">
                    <span aria-hidden className={cn("absolute -left-5 top-[15px] w-[15px] h-[15px] rounded-full border-[3px] border-white", dot)} />
                    <div className="flex justify-between gap-3"><div className="min-w-0"><div className="text-sm font-medium text-ink truncate">{title}</div><div className="text-xs text-ink/60 truncate">{meta}</div></div><div className="text-[11px] text-ink/45 tabular-nums shrink-0">{when}</div></div>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {tab === "booking" && (
            <div className="p-5 md:p-6">
              <div className="flex items-start justify-between gap-4 mb-5">
                <div><div className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink/45">Booking</div><div className="text-lg font-extrabold text-ink tracking-tight mt-1">Brand session · Maya Chen</div><div className="text-sm text-ink/65">Tue, Sep 9 · 2:00 – 4:00 PM · Studio</div></div>
                <span className="text-[11px] font-bold rounded-full bg-info-soft text-info-text px-2.5 py-1">Deposit paid</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_220px] gap-5">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink/45 mb-3">Where it is</div>
                  <ol className="flex items-center gap-1">
                    {["New lead", "Follow-up", "Booked", "Paid", "Complete"].map((s, i) => (
                      <li key={s} className="flex items-center gap-1 flex-1 min-w-0 last:flex-none">
                        <span className={cn("flex items-center gap-1.5 text-[11px] font-bold whitespace-nowrap", i <= 2 ? "text-ink" : i === 3 ? "text-signal-text" : "text-ink/35")}>
                          <span className={cn("w-2.5 h-2.5 rounded-full shrink-0", i <= 2 ? "bg-success" : i === 3 ? "bg-signal" : "bg-black/10")} />{s}
                        </span>
                        {i < 4 && <span className={cn("h-px flex-1 mx-1", i < 2 ? "bg-success" : "bg-border")} />}
                      </li>
                    ))}
                  </ol>
                  <div className="mt-5 text-[10px] font-bold uppercase tracking-[0.12em] text-ink/45 mb-2">On this booking</div>
                  <ol className="relative pl-6 space-y-2 text-sm">
                    <span aria-hidden className="absolute left-[5px] top-2 bottom-2 w-px bg-border" />
                    <li className="relative"><span aria-hidden className="absolute -left-6 top-[5px] w-[11px] h-[11px] rounded-full border-2 border-white bg-accent" />Maya: “Running 10 late!!” <span className="text-ink/45 text-xs">· Messages</span></li>
                    <li className="relative"><span aria-hidden className="absolute -left-6 top-[5px] w-[11px] h-[11px] rounded-full border-2 border-white bg-signal" />Reminder sent · 1 day before</li>
                    <li className="relative"><span aria-hidden className="absolute -left-6 top-[5px] w-[11px] h-[11px] rounded-full border-2 border-white bg-success" />Questionnaire completed</li>
                  </ol>
                </div>
                <div className="rounded-2xl border border-border bg-paper/60 p-4">
                  <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink/45 mb-2">Money</div>
                  <div className="flex justify-between text-sm py-1.5 border-b border-border"><span className="text-ink/65">Total</span><span className="font-bold text-ink tabular-nums">$350</span></div>
                  <div className="flex justify-between text-sm py-1.5 border-b border-border"><span className="text-ink/65">Deposit</span><span className="font-bold text-success-text tabular-nums">$105 paid</span></div>
                  <div className="flex justify-between text-sm py-1.5"><span className="text-ink/65">Balance</span><span className="font-bold text-ink tabular-nums">$245 due Sep 9</span></div>
                  <button type="button" className="mt-3 w-full h-9 rounded-full bg-ink text-white text-xs font-extrabold transition-transform hover:scale-[1.03] active:scale-[0.97]">Request balance</button>
                </div>
              </div>
            </div>
          )}

          {tab === "payments" && (
            <div className="p-5 md:p-6">
              <div className="grid grid-cols-3 gap-3 mb-5">
                {[["Owed to you", "$1,240", "text-ink"], ["This month", "$4,860", "text-success-text"], ["Overdue", "$175", "text-warning-text"]].map(([k, v, t]) => (
                  <div key={k} className="rounded-2xl border border-border px-4 py-3 transition-transform hover:-translate-y-px"><div className="text-[11px] text-ink/55">{k}</div><div className={cn("text-xl font-extrabold tracking-tight tabular-nums", t)}>{v}</div></div>
                ))}
              </div>
              <div className="divide-y divide-border rounded-2xl border border-border overflow-hidden">
                {[
                  ["Balance · Priya Patel", "Full session · due today", "$175", "Overdue", "bg-warning-soft text-warning-text"],
                  ["Deposit · Maya Chen", "Brand session · Sep 9", "$105", "Paid", "bg-success-soft text-success-text"],
                  ["Deposit · Sam Okafor", "Consult · Thu", "$60", "Paid", "bg-success-soft text-success-text"],
                  ["Balance · Maya Chen", "Brand session · due Sep 9", "$245", "Awaiting", "bg-black/[0.05] text-ink/60"],
                ].map(([t, m, amt, st, tone]) => (
                  <div key={t} className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-black/[0.02] transition-colors">
                    <div className="min-w-0 flex-1"><div className="font-semibold text-ink truncate">{t}</div><div className="text-xs text-ink/55 truncate">{m}</div></div>
                    <span className="font-bold text-ink tabular-nums">{amt}</span>
                    <span className={cn("text-[10px] font-bold rounded-full px-2 py-0.5 shrink-0", tone)}>{st}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === "automation" && (
            <div className="p-5 md:p-6 space-y-3">
              {[
                { k: "confirm", name: "Booking confirmation", when: "a booking is created", if: "right away", then: "send a confirmation" },
                { k: "remind", name: "Session reminder", when: "a booking is coming up", if: "1 day before", then: "send a reminder" },
                { k: "thanks", name: "Thank-you + review", when: "a booking is completed", if: "2 days after", then: "send a thank-you" },
              ].map((a) => {
                const on = autos[a.k];
                return (
                  <div key={a.k} className={cn("rounded-2xl border border-border p-4 transition-all duration-300", !on && "opacity-60", on && "shadow-[0_8px_24px_-16px_rgba(109,90,230,0.5)]")}>
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <span className="text-sm font-semibold text-ink">{a.name}</span>
                      <button type="button" role="switch" aria-checked={on} aria-label={`${a.name} ${on ? "on" : "off"}`} onClick={() => setAutos((s) => ({ ...s, [a.k]: !s[a.k] }))} className={cn("relative w-10 h-6 rounded-full transition-colors", on ? "bg-success" : "bg-black/15")}>
                        <span className={cn("absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ease-[cubic-bezier(0.22,1.2,0.36,1)]", on && "translate-x-4")} />
                      </button>
                    </div>
                    <div className="grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-2">
                      <Beat label="When" tone="signal" text={a.when} /><Arrow /><Beat label="If" tone="thinking" text={a.if} /><Arrow /><Beat label="Then" tone="outcome" text={a.then} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {tab === "ai" && (
            <div className="p-5 md:p-6 flex flex-col min-h-[400px]">
              <div className="flex items-center gap-2 mb-4"><span className="w-7 h-7 rounded-full bg-signal-soft text-signal-text flex items-center justify-center"><Sparkles className="w-3.5 h-3.5" strokeWidth={2} /></span><span className="text-sm font-extrabold text-ink">Copilot</span><span className="text-[11px] text-ink/45">knows your whole thread</span></div>
              <div className="flex flex-wrap gap-2 mb-4">
                {["What do I need to do today?", "Who owes me money?", "Which leads are hot?"].map((q) => (
                  <button key={q} type="button" onClick={() => setAsked(q)} className={cn("text-xs px-3 py-1.5 rounded-full border transition-all duration-200 active:scale-95", asked === q ? "bg-ink text-white border-ink" : "border-border hover:bg-black/[0.04] hover:-translate-y-px")}>{q}</button>
                ))}
              </div>
              {asked && (
                <div key={asked} className="dt-swap space-y-3 max-w-lg">
                  <div className="ml-auto w-fit rounded-2xl bg-ink text-white text-sm px-3.5 py-2.5">{asked}</div>
                  <div className="flex items-start gap-2">
                    <span className="w-6 h-6 rounded-full bg-signal-soft text-signal-text flex items-center justify-center shrink-0 mt-0.5"><Sparkles className="w-3 h-3" strokeWidth={2} /></span>
                    <div className="rounded-2xl bg-signal-soft/50 border border-signal/15 text-sm text-ink px-3.5 py-2.5 leading-relaxed">
                      {asked.startsWith("What") && <>Three things. <span className="font-semibold">Reply to Maya</span> — she asked about Tuesday 2 hours ago. <span className="font-semibold">Collect $175</span> from Priya, due today. <span className="font-semibold">Confirm Jordan&rsquo;s 10:00</span> consult.</>}
                      {asked.startsWith("Who") && <><span className="font-semibold">$1,240</span> across three balances: Priya $175 (overdue today), Maya $245 (due Sep 9), Jordan $820 (due Sep 20).</>}
                      {asked.startsWith("Which") && <><span className="font-semibold">Maya Chen</span> (82) — returning, asked for a date. <span className="font-semibold">Sam Okafor</span> (88) — booked, just rescheduled. Jordan Lee (61) is cooling: 9 days without a reply.</>}
                    </div>
                  </div>
                </div>
              )}
              {!asked && <p className="text-xs text-ink/45">Pick a question. Answers come from your real inbox, bookings and payments.</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const BEAT = {
  signal: { dot: "bg-accent", label: "text-accent-text", bg: "bg-accent-soft/50" },
  thinking: { dot: "bg-signal", label: "text-signal-text", bg: "bg-signal-soft/60" },
  outcome: { dot: "bg-success", label: "text-success-text", bg: "bg-success-soft/60" },
} as const;

export function Beat({ label, tone, text }: { label: string; tone: keyof typeof BEAT; text: string }) {
  const t = BEAT[tone];
  return (
    <div className={cn("rounded-xl px-3 py-2 min-w-0", t.bg)}>
      <div className={cn("flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide mb-0.5", t.label)}><span className={cn("w-1.5 h-1.5 rounded-full", t.dot)} />{label}</div>
      <div className="text-[13px] text-ink truncate">{text}</div>
    </div>
  );
}

export function Arrow() {
  return (
    <svg width="16" height="12" viewBox="0 0 18 12" fill="none" aria-hidden className="text-ink/25 shrink-0">
      <path d="M1 6h14m0 0-4-4m4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
