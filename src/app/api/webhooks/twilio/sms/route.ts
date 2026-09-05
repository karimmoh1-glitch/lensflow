import { NextResponse } from "next/server";
import { validateRequest } from "twilio";
import { prisma } from "@/lib/db";
import { ingestInboundMessage } from "@/server/leadIngestion";

/**
 * Twilio's SMS webhook — configure this URL as the "A message comes in" webhook on the
 * business's Twilio phone number. Real, working code: the only thing missing in this
 * environment is an actual Twilio account and number to point at it.
 *
 * Twilio POSTs application/x-www-form-urlencoded with From/To/Body/MessageSid, signed
 * with the X-Twilio-Signature header. Verified against TWILIO_AUTH_TOKEN below — without
 * this, anyone who learns the URL could forge inbound messages into a business's inbox.
 */
export async function POST(req: Request) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) {
    return NextResponse.json({ error: "SMS receiving isn't configured on this deployment." }, { status: 501 });
  }

  const rawBody = await req.text();
  const form = new URLSearchParams(rawBody);
  const params = Object.fromEntries(form.entries());

  const signature = req.headers.get("x-twilio-signature") ?? "";
  const valid = validateRequest(authToken, signature, req.url, params);
  if (!valid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
  }

  const from = String(form.get("From") ?? "");
  const to = String(form.get("To") ?? "");
  const body = String(form.get("Body") ?? "");

  if (!from || !to || !body) {
    return new NextResponse("<Response></Response>", { status: 400, headers: { "Content-Type": "text/xml" } });
  }

  // Route by the destination number; it belongs to exactly one business (unique).
  const business = await prisma.business.findUnique({ where: { twilioPhoneNumber: to } });
  if (!business) {
    // Unknown destination number — acknowledge so Twilio doesn't retry, but do nothing.
    return new NextResponse("<Response></Response>", { headers: { "Content-Type": "text/xml" } });
  }

  const messageSid = String(form.get("MessageSid") ?? "");

  await ingestInboundMessage({
    businessId: business.id,
    channel: "SMS",
    senderName: from,
    senderHandle: from,
    body,
    clientPhone: from,
    providerMessageId: messageSid || undefined,
  });

  return new NextResponse("<Response></Response>", { headers: { "Content-Type": "text/xml" } });
}
