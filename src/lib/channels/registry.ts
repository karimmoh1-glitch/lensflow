import type { ChannelType } from "@prisma/client";
import type { ChannelAdapter } from "./types";
import { EmailAdapter } from "./emailAdapter";
import { SmsAdapter } from "./smsAdapter";
import { InstagramAdapter } from "./instagramAdapter";
import { WhatsAppAdapter } from "./whatsappAdapter";
import { PhoneAdapter } from "./phoneAdapter";
import { WebsiteAdapter } from "./websiteAdapter";

const registry: Record<ChannelType, ChannelAdapter> = {
  EMAIL: new EmailAdapter(),
  SMS: new SmsAdapter(),
  INSTAGRAM: new InstagramAdapter(),
  WHATSAPP: new WhatsAppAdapter(),
  PHONE: new PhoneAdapter(),
  WEBSITE: new WebsiteAdapter(),
};

export function getChannelAdapter(channel: ChannelType): ChannelAdapter {
  return registry[channel];
}

export function getAllChannelAdapters(): ChannelAdapter[] {
  return Object.values(registry);
}
