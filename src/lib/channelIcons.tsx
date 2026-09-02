import { MessageSquare, Mail, Phone, MessageCircle, Globe } from "lucide-react";
import type { ChannelType } from "@prisma/client";

function CameraGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" strokeWidth="1.9" />
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.9" />
      <circle cx="17" cy="7" r="1" fill="currentColor" />
    </svg>
  );
}

type IconComponent = (props: { className?: string; strokeWidth?: number }) => React.ReactNode;

export const CHANNEL_META: Record<ChannelType, { label: string; icon: IconComponent; bg: string }> = {
  INSTAGRAM: { label: "Instagram", icon: CameraGlyph, bg: "bg-gradient-to-br from-[#FEDA75] via-[#D62976] to-[#4F5BD5]" },
  EMAIL: { label: "Email", icon: Mail, bg: "bg-[#4F46E5]" },
  SMS: { label: "SMS", icon: MessageSquare, bg: "bg-[#3B82F6]" },
  WHATSAPP: { label: "WhatsApp", icon: MessageCircle, bg: "bg-[#25D366]" },
  PHONE: { label: "Phone", icon: Phone, bg: "bg-[#0D9488]" },
  WEBSITE: { label: "Website", icon: Globe, bg: "bg-ink/70" },
};

export function ChannelBadge({ channel, className }: { channel: ChannelType; className?: string }) {
  const meta = CHANNEL_META[channel];
  return (
    <div className={`w-4 h-4 rounded-[5px] flex items-center justify-center text-white shrink-0 ${meta.bg} ${className ?? ""}`}>
      <meta.icon className="w-2.5 h-2.5" strokeWidth={2.2} />
    </div>
  );
}
