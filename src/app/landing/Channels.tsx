import type { CSSProperties } from "react";
import type { RegisteredProvider } from "@/lib/integrations/registry";
import { ChannelIcon, type ChannelKey } from "./ChannelIcon";
import { ScrollScene } from "./Scroll";
import { Reveal } from "./Reveal";
import { channelStatus } from "./channelStatus";

/**
 * Where clients actually write, and what Daythread does with each. Scrolling draws the
 * channels into one list: six inboxes become one conversation. The status beside every
 * channel is read from this deployment's own configuration, so the page can never claim a
 * connection a customer can't make today — the convergence is the idea; the list is the fact.
 */
type Row = { name: string; what: string; provider: RegisteredProvider | null; icon: ChannelKey | "zoom" | "outlook" };

const ROWS: Row[] = [
  { name: "Instagram DMs", what: "Every DM in the inbox, answered from Daythread", provider: "INSTAGRAM", icon: "instagram" },
  { name: "Texts", what: "Two-way SMS on a business number", provider: "SMS", icon: "sms" },
  { name: "WhatsApp", what: "Your WhatsApp Business number, same thread", provider: "WHATSAPP", icon: "whatsapp" },
  { name: "Gmail", what: "Your real inbox, not a copy you have to forward to", provider: "EMAIL", icon: "gmail" },
  { name: "Outlook", what: "Microsoft 365 mail, read and answered in place", provider: "MICROSOFT_OUTLOOK", icon: "outlook" },
  { name: "Zoom chat", what: "Direct messages from clients outside your account", provider: "ZOOM", icon: "zoom" },
  { name: "Your booking page", what: "Bookings and inquiries arrive already filled in", provider: null, icon: "website" },
];

export function Channels() {
  const rows = ROWS.map((r) => ({ ...r, status: channelStatus(r.provider) }));
  const converging = rows.filter((r) => r.provider !== null);
  return (
    <div className="max-w-[1200px] mx-auto px-6 grid grid-cols-1 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-10 lg:gap-16 items-start">
      <Reveal className="lg:sticky lg:top-28">
        <h2 className="font-sans font-bold text-[clamp(2.1rem,4.2vw,3.4rem)] leading-[1] tracking-[-0.04em] text-ink text-balance">Answer where they write.</h2>
        <p className="mt-4 text-[1.0625rem] text-ink/60 leading-relaxed max-w-md">Clients don&rsquo;t fill in forms first. They DM, they text, they reply to an old email. Daythread brings all of it into one list, sorted by who has waited longest.</p>
        <p className="mt-6 text-sm text-ink/60 max-w-md">Already use a tool for contracts and invoices? Keep it. Daythread is where the inquiry gets answered and booked.</p>
      </Reveal>

      <div>
        <ScrollScene span="enter" settle={0.3} className="dt-converge-stage relative">
          {/* Six channels, drawn together into one row as you scroll. */}
          <div className="relative h-[196px]" aria-hidden>
            <ul className="absolute inset-x-0 top-0 grid" style={{ gridTemplateColumns: `repeat(${converging.length}, minmax(0, 1fr))` }}>
              {converging.map((r, i) => (
                <li key={r.name} className="dt-converge flex flex-col items-center gap-1.5" style={{ "--i": i, "--n": converging.length } as CSSProperties}>
                  <Icon k={r.icon} />
                  <span className={r.status === "Live" ? "dt-converge-label text-2xs font-medium text-success-text" : "dt-converge-label text-2xs font-medium text-ink/60"}>{r.status}</span>
                </li>
              ))}
            </ul>
            <div className="dt-step absolute inset-x-0 bottom-0" style={{ "--a": 0.55, "--b": 0.8, "--dy": "10px" } as CSSProperties}>
              <div className="mx-auto max-w-md rounded-xl border border-border bg-white shadow-[0_1px_0_rgba(16,17,20,0.03),0_16px_40px_-28px_rgba(16,17,20,0.3)] px-4 py-3 flex items-start gap-3">
                <span className="relative mt-0.5 w-8 h-8 rounded-full bg-ink/[0.06] text-ink/75 text-2xs font-semibold flex items-center justify-center shrink-0">
                  MC
                  <span className="absolute -top-px -right-px w-2.5 h-2.5 rounded-full bg-accent ring-2 ring-white" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span className="text-sm font-semibold text-ink truncate">Maya Chen</span>
                    <span className="ml-auto text-xs text-ink/60 tabular-nums">2m</span>
                  </span>
                  <span className="mt-0.5 flex items-center gap-1.5">
                    <ChannelIcon k="instagram" size={14} />
                    <span className="text-13 text-ink/70 truncate">Asked about Portrait session on Friday at 2:00 PM.</span>
                  </span>
                </span>
              </div>
            </div>
          </div>
          <p className="dt-step mt-4 text-center text-13 text-ink/60" style={{ "--a": 0.7, "--b": 0.9, "--dy": "6px" } as CSSProperties}>
            One list. One thread per person, whichever channel they used.
          </p>
        </ScrollScene>

        <ul className="mt-10 rounded-2xl border border-border bg-white shadow-[0_1px_0_rgba(16,17,20,0.03),0_16px_40px_-28px_rgba(16,17,20,0.3)] divide-y divide-border">
          {rows.map((r) => (
            <li key={r.name} className="flex items-center gap-4 px-5 py-4">
              <Icon k={r.icon} />
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold text-ink">{r.name}</p>
                <p className="text-13 text-ink/60">{r.what}</p>
              </div>
              <span className={r.status === "Live" ? "text-xs font-medium text-success-text" : "text-xs font-medium text-ink/60"}>{r.status}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-ink/60">Status is this deployment&rsquo;s, today. Beta channels work but are still being proven with early customers; Coming soon means the provider isn&rsquo;t connected here yet.</p>
      </div>
    </div>
  );
}

function Icon({ k }: { k: Row["icon"] }) {
  if (k === "zoom") {
    return (
      <span aria-hidden className="w-9 h-9 rounded-[10px] bg-[#0B5CFF] flex items-center justify-center shrink-0">
        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="white">
          <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h9A1.5 1.5 0 0 1 15 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 3 16.5v-9Zm13.5 3 3.7-2.6c.5-.3 1.1 0 1.1.6v7c0 .6-.6.9-1.1.6l-3.7-2.6v-3Z" />
        </svg>
      </span>
    );
  }
  if (k === "outlook") {
    return <span aria-hidden className="w-9 h-9 rounded-[10px] bg-[#0F6CBD] flex items-center justify-center shrink-0 text-white text-[15px] font-bold">O</span>;
  }
  return <ChannelIcon k={k} size={36} />;
}
