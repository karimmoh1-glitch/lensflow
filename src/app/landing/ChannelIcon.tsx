import { cn } from "@/lib/utils";

/**
 * The channels Daythread actually connects (prisma ChannelType: INSTAGRAM, EMAIL, SMS,
 * WHATSAPP, WEBSITE, PHONE). Each one drawn with its own recognizable identity — not a
 * lucide glyph in a colored square — inside one shared system: same radius, same
 * highlight, same shadow language. Messenger is deliberately absent: the product doesn't
 * support it.
 */
export type ChannelKey = "instagram" | "gmail" | "sms" | "whatsapp" | "website";

export const CHANNEL: Record<ChannelKey, { name: string; brand: string; soft: string }> = {
  instagram: { name: "Instagram", brand: "#D62976", soft: "rgba(214,41,118,0.10)" },
  gmail: { name: "Gmail", brand: "#EA4335", soft: "rgba(234,67,53,0.10)" },
  sms: { name: "Messages", brand: "#34C759", soft: "rgba(52,199,89,0.12)" },
  whatsapp: { name: "WhatsApp", brand: "#25D366", soft: "rgba(37,211,102,0.12)" },
  website: { name: "Booking page", brand: "#101114", soft: "rgba(16,17,20,0.06)" },
};

export function ChannelIcon({ k, size = 56, className, active }: { k: ChannelKey; size?: number; className?: string; active?: boolean }) {
  const r = Math.round(size * 0.28);
  const common = cn("relative flex items-center justify-center shrink-0 transition-all duration-300 ease-[cubic-bezier(0.22,1.2,0.36,1)]", className);
  const shadow = active ? `0 14px 30px -10px ${CHANNEL[k].brand}` : "0 6px 16px -8px rgba(16,17,20,0.35)";
  const style = { width: size, height: size, borderRadius: r, boxShadow: shadow, transform: active ? "translateY(-2px) scale(1.06)" : undefined } as const;

  if (k === "instagram") {
    return (
      <span className={common} style={{ ...style, background: "radial-gradient(120% 120% at 20% 110%, #FEDA75 0%, #FA7E1E 25%, #D62976 55%, #962FBF 80%, #4F5BD5 100%)" }} title="Instagram">
        <svg viewBox="0 0 24 24" fill="none" style={{ width: size * 0.5, height: size * 0.5 }} aria-hidden>
          <rect x="3" y="3" width="18" height="18" rx="5.5" stroke="white" strokeWidth="2" />
          <circle cx="12" cy="12" r="4.2" stroke="white" strokeWidth="2" />
          <circle cx="17.3" cy="6.7" r="1.25" fill="white" />
        </svg>
      </span>
    );
  }
  if (k === "gmail") {
    return (
      <span className={common} style={{ ...style, background: "#fff", border: "1px solid rgba(16,17,20,0.08)" }} title="Gmail">
        <svg viewBox="0 0 24 18" fill="none" style={{ width: size * 0.52, height: size * 0.4 }} aria-hidden>
          <path d="M2 4.2V15a1.5 1.5 0 0 0 1.5 1.5H6V8.4L2 4.2Z" fill="#4285F4" />
          <path d="M22 4.2V15a1.5 1.5 0 0 1-1.5 1.5H18V8.4l4-4.2Z" fill="#34A853" />
          <path d="M6 8.4V16.5H3.5A1.5 1.5 0 0 1 2 15V5.5L6 8.4Z" fill="#4285F4" />
          <path d="M2 5.5V3.6c0-1.6 1.8-2.5 3.1-1.6L6 2.7l6 4.5 6-4.5.9-.7c1.3-.9 3.1 0 3.1 1.6v1.9L12 13 2 5.5Z" fill="#EA4335" />
          <path d="M2 5.5V3.6c0-1.6 1.8-2.5 3.1-1.6L6 2.7v5.7L2 5.5Z" fill="#C5221F" />
          <path d="M22 5.5V3.6c0-1.6-1.8-2.5-3.1-1.6L18 2.7v5.7l4-2.9Z" fill="#FBBC04" />
        </svg>
      </span>
    );
  }
  if (k === "sms") {
    return (
      <span className={common} style={{ ...style, background: "linear-gradient(180deg, #5DF77D 0%, #34C759 100%)" }} title="Messages">
        <svg viewBox="0 0 24 24" fill="none" style={{ width: size * 0.5, height: size * 0.5 }} aria-hidden>
          <path d="M12 3.5c-5 0-9 3.3-9 7.4 0 2.2 1.2 4.2 3 5.6-.1 1.2-.6 2.3-1.4 3.3 1.7-.2 3.3-.9 4.5-1.9.9.2 1.9.4 2.9.4 5 0 9-3.3 9-7.4S17 3.5 12 3.5Z" fill="white" />
        </svg>
      </span>
    );
  }
  if (k === "whatsapp") {
    return (
      <span className={common} style={{ ...style, background: "linear-gradient(180deg, #5BE07A 0%, #25D366 100%)" }} title="WhatsApp">
        <svg viewBox="0 0 24 24" fill="none" style={{ width: size * 0.52, height: size * 0.52 }} aria-hidden>
          <path d="M12 3a9 9 0 0 0-7.8 13.5L3 21l4.6-1.2A9 9 0 1 0 12 3Z" stroke="white" strokeWidth="1.9" strokeLinejoin="round" />
          <path d="M9.2 7.6c-.3-.6-.6-.6-.9-.6h-.7c-.3 0-.7.1-1 .5-.4.4-1.3 1.3-1.3 3.1s1.4 3.6 1.6 3.8c.2.3 2.6 4.1 6.4 5.5 3.2 1.2 3.8 1 4.5.9.7-.1 2.1-.9 2.4-1.7.3-.8.3-1.5.2-1.7-.1-.2-.4-.3-.8-.5s-2.1-1-2.4-1.1c-.3-.1-.6-.2-.8.2-.2.4-.9 1.1-1.1 1.4-.2.2-.4.3-.8.1-.4-.2-1.5-.6-2.9-1.8-1.1-1-1.8-2.1-2-2.5-.2-.4 0-.6.2-.8l.5-.6c.2-.2.2-.4.4-.6.1-.2.1-.4 0-.6-.1-.2-.8-2-1.1-2.7Z" fill="white" />
        </svg>
      </span>
    );
  }
  return (
    <span className={common} style={{ ...style, background: "linear-gradient(180deg, #2A2C33 0%, #101114 100%)" }} title="Your booking page">
      <svg viewBox="0 0 24 24" fill="none" style={{ width: size * 0.48, height: size * 0.48 }} aria-hidden>
        <circle cx="12" cy="12" r="8.5" stroke="white" strokeWidth="1.8" />
        <path d="M3.5 12h17M12 3.5c2.6 2.6 2.6 14.4 0 17M12 3.5c-2.6 2.6-2.6 14.4 0 17" stroke="white" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    </span>
  );
}
