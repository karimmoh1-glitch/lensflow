import { siWhatsapp, siInstagram, siImessage } from "simple-icons";
import { cn } from "@/lib/utils";

/**
 * The channels Daythread actually connects (prisma ChannelType: INSTAGRAM, EMAIL, SMS,
 * WHATSAPP, WEBSITE, PHONE), drawn with their real marks. The glyph paths come from
 * simple-icons — the official brand geometry, not an approximation — except Gmail, whose
 * four-color M is drawn from Google's own logo geometry because the library only carries a
 * monochrome glyph. Each app keeps its own form: Instagram's gradient tile, WhatsApp's
 * green circle, Gmail's white tile with the M, Messages' green bubble tile, and the booking page as Daythread's own ink.
 * Messenger is deliberately absent: the product doesn't support it.
 */
export type ChannelKey = "instagram" | "gmail" | "sms" | "whatsapp" | "website";

export const CHANNEL: Record<ChannelKey, { name: string; brand: string; soft: string }> = {
  instagram: { name: "Instagram", brand: "#D62976", soft: "rgba(214,41,118,0.10)" },
  gmail: { name: "Gmail", brand: "#EA4335", soft: "rgba(234,67,53,0.10)" },
  sms: { name: "Messages", brand: "#34C759", soft: "rgba(52,199,89,0.12)" },
  whatsapp: { name: "WhatsApp", brand: "#25D366", soft: "rgba(37,211,102,0.12)" },
  website: { name: "Booking page", brand: "#101114", soft: "rgba(16,17,20,0.06)" },
};

function Mark({ path, size, color = "white" }: { path: string; size: number; color?: string }) {
  return (
    <svg viewBox="0 0 24 24" style={{ width: size, height: size }} aria-hidden>
      <path d={path} fill={color} />
    </svg>
  );
}

export function ChannelIcon({ k, size = 56, className, active }: { k: ChannelKey; size?: number; className?: string; active?: boolean }) {
  const common = cn("relative flex items-center justify-center shrink-0 transition-all duration-300 ease-[cubic-bezier(0.22,1.2,0.36,1)]", className);
  const shadow = active ? `0 14px 30px -10px ${CHANNEL[k].brand}` : "0 6px 16px -8px rgba(16,17,20,0.35)";
  const base = { width: size, height: size, boxShadow: shadow, transform: active ? "translateY(-2px) scale(1.06)" : undefined } as const;

  if (k === "instagram") {
    return (
      <span className={common} style={{ ...base, borderRadius: Math.round(size * 0.27), background: "radial-gradient(120% 120% at 20% 110%, #FEDA75 0%, #FA7E1E 25%, #D62976 55%, #962FBF 80%, #4F5BD5 100%)" }} title="Instagram">
        <Mark path={siInstagram.path} size={size * 0.56} />
      </span>
    );
  }
  if (k === "whatsapp") {
    return (
      <span className={common} style={{ ...base, borderRadius: 9999, background: "linear-gradient(180deg, #5FF08A 0%, #25D366 100%)" }} title="WhatsApp">
        <Mark path={siWhatsapp.path} size={size * 0.6} />
      </span>
    );
  }
  if (k === "gmail") {
    // The Gmail mark as Google draws it: the four-color M — red across the top, blue on
    // the left, green on the right, the folded corners in darker red and yellow — on a
    // white tile. Not the monochrome glyph, not an envelope, not a "G".
    return (
      <span className={common} style={{ ...base, borderRadius: Math.round(size * 0.24), background: "#fff", border: "1px solid rgba(16,17,20,0.08)" }} title="Gmail">
        <svg viewBox="0 0 24 24" style={{ width: size * 0.56, height: size * 0.56 }} aria-hidden>
          <path fill="#4285F4" d="M1.636 20.6h3.818V11.33L0 7.234v11.73A1.636 1.636 0 0 0 1.636 20.6z" />
          <path fill="#34A853" d="M18.545 20.6h3.819A1.636 1.636 0 0 0 24 18.964V7.234l-5.455 4.095V20.6z" />
          <path fill="#FBBC04" d="M18.545 4.234v7.095L24 7.234V5.052c0-2.023-2.309-3.177-3.927-1.964l-1.528 1.146z" />
          <path fill="#EA4335" d="M5.455 11.33V4.234L12 9.143l6.545-4.909v7.095L12 16.234 5.455 11.33z" />
          <path fill="#C5221F" d="M0 5.052v2.182l5.455 4.095V4.234L3.927 3.088C2.309 1.875 0 3.029 0 5.052z" />
        </svg>
      </span>
    );
  }
  if (k === "sms") {
    return (
      <span className={common} style={{ ...base, borderRadius: Math.round(size * 0.24), background: "linear-gradient(180deg, #5DF77D 0%, #34C759 100%)" }} title="Messages">
        <Mark path={siImessage.path} size={size * 0.56} />
      </span>
    );
  }
  return (
    <span className={common} style={{ ...base, borderRadius: Math.round(size * 0.24), background: "linear-gradient(180deg, #2A2C33 0%, #101114 100%)" }} title="Your booking page">
      <svg viewBox="0 0 24 24" fill="none" style={{ width: size * 0.5, height: size * 0.5 }} aria-hidden>
        <rect x="3.5" y="5" width="17" height="15" rx="3" stroke="white" strokeWidth="1.8" />
        <path d="M3.5 9.5h17M8 3v4M16 3v4" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="12" cy="14.5" r="1.4" fill="#F0524D" />
      </svg>
    </span>
  );
}
