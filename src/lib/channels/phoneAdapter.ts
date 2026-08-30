import type { ChannelAdapter, ChannelCapabilities, OutboundMessage, SendResult } from "./types";

/**
 * A phone number can't just be "read" by a web app — this needs a telephony provider
 * in the middle. The legitimate model (e.g. Twilio Programmable Voice): the business's
 * number is provisioned through the provider, incoming calls hit a webhook with caller
 * ID in the `From` field, which is enough to open/create a lead profile by phone number
 * without any audio access. Call recording is NOT enabled by default here — it requires
 * explicit two-party consent in most US states and is out of scope until that's handled
 * deliberately, not as a side effect of "supporting phone."
 */
export class PhoneAdapter implements ChannelAdapter {
  readonly channel = "PHONE" as const;

  capabilities(): ChannelCapabilities {
    return {
      canSend: false,
      canReceive: false,
      live: false,
      setupNote:
        "Requires a telephony provider (e.g. Twilio Voice) with a provisioned business number and an incoming-call webhook. Recording requires explicit two-party consent and is not implemented.",
    };
  }

  async send(message: OutboundMessage): Promise<SendResult> {
    console.log(`[phone-adapter:demo] call notes for ${message.to ?? "unknown"}: ${message.body}`);
    return { ok: true, simulated: true };
  }
}
