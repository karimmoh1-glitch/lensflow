/**
 * Twilio, platform-owned: Daythread's account provisions a dedicated number per business
 * (search → buy → point its webhooks at us). Customers never see Twilio credentials.
 * Outbound sends carry a status callback so "delivered" and "failed" are Twilio's words,
 * not ours. Everything is scoped by the business's own number.
 */
export function twilioConfigured(): boolean {
  return Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN);
}

async function client() {
  const twilio = (await import("twilio")).default;
  return twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!);
}

export type AvailableNumber = { phoneNumber: string; friendlyName: string; locality: string | null; region: string | null };

export async function searchNumbers(areaCode?: string, country = "US"): Promise<AvailableNumber[]> {
  const c = await client();
  const list = await c.availablePhoneNumbers(country).local.list({ areaCode: areaCode ? Number(areaCode) : undefined, smsEnabled: true, limit: 8 });
  return list.map((n) => ({ phoneNumber: n.phoneNumber, friendlyName: n.friendlyName, locality: n.locality ?? null, region: n.region ?? null }));
}

/** Buys the number and wires both webhooks to this deployment. Returns the E.164 number. */
export async function provisionNumber(phoneNumber: string, businessName: string): Promise<{ phoneNumber: string; sid: string }> {
  const c = await client();
  const base = process.env.NEXT_PUBLIC_APP_URL;
  const bought = await c.incomingPhoneNumbers.create({
    phoneNumber,
    friendlyName: `Daythread · ${businessName}`.slice(0, 64),
    smsUrl: `${base}/api/webhooks/twilio/sms`,
    smsMethod: "POST",
    statusCallback: `${base}/api/webhooks/twilio/status`,
    statusCallbackMethod: "POST",
  });
  return { phoneNumber: bought.phoneNumber, sid: bought.sid };
}

export async function releaseNumber(sid: string): Promise<void> {
  const c = await client();
  await c.incomingPhoneNumbers(sid).remove().catch(() => {});
}

export async function sendSms(from: string, to: string, body: string): Promise<{ sid: string; status: string }> {
  const c = await client();
  const m = await c.messages.create({ to, from, body, statusCallback: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/twilio/status` });
  return { sid: m.sid, status: m.status };
}
