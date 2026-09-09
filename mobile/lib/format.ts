import { formatDistanceToNowStrict } from "date-fns";
import type { Ionicons } from "@expo/vector-icons";

export const money = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
export const ago = (iso: string | null | undefined) => (iso ? formatDistanceToNowStrict(new Date(iso), { addSuffix: true }) : "");
export const firstName = (name: string | null | undefined, fallback = "there") => (name?.trim().split(/\s+/)[0] || fallback);
export const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";

export const CHANNEL: Record<string, { label: string; icon: keyof typeof Ionicons.glyphMap }> = {
  INSTAGRAM: { label: "Instagram", icon: "logo-instagram" },
  EMAIL: { label: "Email", icon: "mail-outline" },
  SMS: { label: "SMS", icon: "chatbubble-outline" },
  WHATSAPP: { label: "WhatsApp", icon: "logo-whatsapp" },
  WEBSITE: { label: "Website", icon: "globe-outline" },
  PHONE: { label: "Phone", icon: "call-outline" },
};
export const channelLabel = (c: string | null | undefined) => (c ? CHANNEL[c]?.label ?? c : "");
