import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ingestInboundMessage } from "@/server/leadIngestion";

/**
 * Twilio's SMS webhook — configure this URL as the "A message comes in" webhook on the
 * business's Twilio phone number. Real, working code: the only thing missing in this
 * environment is an actual Twilio account and number to point at it.
 *
 * Twilio POSTs application/x-www-form-urlencoded with From/To/Body/MessageSid. In
 * production this should also verify the X-Twilio-Signature header against
 * TWILIO_AUTH_TOKEN before trusting the payload — noted here rather than skipped
 * silently, since there's no real number yet to receive a signed request from.
 */
export async function POST(req: Request) {
  const form = await req.formData();
  const from = String(form.get("From") ?? "");
  const to = String(form.get("To") ?? "");
  const body = String(form.get("Body") ?? "");

  if (!from || !to || !body) {
    return new NextResponse("<Response></Response>", { status: 400, headers: { "Content-Type": "text/xml" } });
  }

  const business = await prisma.business.findUnique({ where: { twilioPhoneNumber: to } });
  if (!business) {
    // Unknown destination number — acknowledge so Twilio doesn't retry, but do nothing.
    return new NextResponse("<Response></Response>", { headers: { "Content-Type": "text/xml" } });
  }

  await ingestInboundMessage({
    businessId: business.id,
    channel: "SMS",
    senderName: from,
    senderHandle: from,
    body,
    clientPhone: from,
  });

  return new NextResponse("<Response></Response>", { headers: { "Content-Type": "text/xml" } });
}
