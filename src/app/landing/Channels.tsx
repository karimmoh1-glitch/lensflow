import { PROVIDERS, providerConfigured, providerMaturity, type RegisteredProvider } from "@/lib/integrations/registry";
import { ChannelIcon, type ChannelKey } from "./ChannelIcon";
import { Reveal } from "./Reveal";

/**
 * Where clients actually write, and what Daythread does with each. The status beside every
 * channel is read from this deployment's own configuration, so the page can never claim a
 * connection a customer can't make today.
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

function status(provider: RegisteredProvider | null): "Live" | "Beta" | "Coming soon" {
  if (!provider) return "Live";
  const maturity = providerMaturity(provider);
  if (maturity === "off" || maturity === "coming_soon" || !providerConfigured(PROVIDERS[provider])) return "Coming soon";
  return maturity === "beta" ? "Beta" : "Live";
}

export function Channels() {
  return (
    <div className="max-w-[1200px] mx-auto px-6 grid grid-cols-1 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-10 lg:gap-16 items-start">
      <Reveal className="lg:sticky lg:top-28">
        <h2 className="font-sans font-bold text-[clamp(2.1rem,4.2vw,3.4rem)] leading-[1] tracking-[-0.04em] text-ink text-balance">Answer where they write.</h2>
        <p className="mt-4 text-[1.0625rem] text-ink/60 leading-relaxed max-w-md">Clients don&rsquo;t fill in forms first. They DM, they text, they reply to an old email. Daythread brings all of it into one list, sorted by who has waited longest.</p>
        <p className="mt-6 text-sm text-ink/60 max-w-md">Already use a tool for contracts and invoices? Keep it. Daythread is where the inquiry gets answered and booked.</p>
      </Reveal>
      <ul className="rounded-2xl border border-border bg-white shadow-[0_1px_0_rgba(16,17,20,0.03),0_16px_40px_-28px_rgba(16,17,20,0.3)] divide-y divide-border">
        {ROWS.map((r) => {
          const s = status(r.provider);
          return (
            <li key={r.name} className="flex items-center gap-4 px-5 py-4">
              <Icon k={r.icon} />
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold text-ink">{r.name}</p>
                <p className="text-13 text-ink/60">{r.what}</p>
              </div>
              <span className={s === "Live" ? "text-xs font-medium text-success-text" : "text-xs font-medium text-ink/60"}>{s}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Icon({ k }: { k: Row["icon"] }) {
  if (k === "zoom") {
    return (
      <span aria-hidden className="w-9 h-9 rounded-[10px] bg-[#0B5CFF] flex items-center justify-center shrink-0">
        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="white"><path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h9A1.5 1.5 0 0 1 15 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 3 16.5v-9Zm13.5 3 3.7-2.6c.5-.3 1.1 0 1.1.6v7c0 .6-.6.9-1.1.6l-3.7-2.6v-3Z" /></svg>
      </span>
    );
  }
  if (k === "outlook") {
    return (
      <span aria-hidden className="w-9 h-9 rounded-[10px] bg-[#0F6CBD] flex items-center justify-center shrink-0 text-white text-[15px] font-bold">O</span>
    );
  }
  return <ChannelIcon k={k} size={36} />;
}
