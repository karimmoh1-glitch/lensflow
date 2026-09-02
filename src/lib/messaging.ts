import type { ChannelType } from "@prisma/client";
import { getChannelAdapter } from "./channels/registry";
import type { SendResult } from "./channels/types";

export type { SendResult };

/**
 * Sends a reply through whichever channel adapter owns this conversation — the caller
 * never needs to know whether that means a real Resend/Twilio API call or a demo log
 * line. See src/lib/channels for the adapters themselves and their real capabilities.
 */
export async function sendOnChannel(params: {
  channel: ChannelType;
  to: string | null;
  subject?: string;
  body: string;
  fromName?: string;
  replyTo?: string;
  headers?: Record<string, string>;
}): Promise<SendResult> {
  const adapter = getChannelAdapter(params.channel);
  return adapter.send({
    to: params.to,
    body: params.body,
    subject: params.subject,
    fromName: params.fromName,
    replyTo: params.replyTo,
    headers: params.headers,
  });
}

export function messagingIsLive(channel: ChannelType): boolean {
  return getChannelAdapter(channel).capabilities().live;
}
