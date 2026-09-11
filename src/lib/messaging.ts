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
  from?: string | null;
}): Promise<SendResult> {
  const adapter = getChannelAdapter(params.channel);
  return adapter.send({
    to: params.to,
    body: params.body,
    subject: params.subject,
    fromName: params.fromName,
    replyTo: params.replyTo,
    headers: params.headers,
    from: params.from,
  });
}

/**
 * What actually happened to a transactional email, in a form the UI can be honest about.
 * `emailed` is true only when the provider accepted the message; everything else carries a
 * sentence explaining why the recipient has not been contacted, so no screen can claim a
 * message was sent when nothing left the building.
 */
export type TransactionalDelivery = { emailed: boolean; note: string };

export async function sendTransactional(params: Parameters<typeof sendOnChannel>[0]): Promise<TransactionalDelivery> {
  const result = await sendOnChannel(params).catch(() => ({ ok: false as const, error: "Email provider error" }));
  if (!result.ok) return { emailed: false, note: `We could not send the email: ${result.error}` };
  if (result.simulated) {
    return { emailed: false, note: result.reason ?? "Email isn't switched on for this workspace yet, so nothing was sent." };
  }
  return { emailed: true, note: "Sent by email." };
}

export function messagingIsLive(channel: ChannelType): boolean {
  return getChannelAdapter(channel).capabilities().live;
}
