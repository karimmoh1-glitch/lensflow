import { NextResponse } from "next/server";
import { validateRequest } from "twilio";
import { prisma } from "@/lib/db";
import { reportFailure } from "@/lib/observe";

/**
 * Twilio's message status callback (queued → sent → delivered / undelivered / failed).
 * Signature-verified like the inbound webhook. The message is found by its Twilio SID
 * (our providerMessageId) and only ever moves to a state Twilio reported — a failed text
 * shows as failed with Twilio's error code, never as sent.
 */
export async function POST(req: Request) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) return NextResponse.json({ error: "SMS isn't configured on this deployment." }, { status: 501 });
  const raw = await req.text();
  const form = new URLSearchParams(raw);
  const params = Object.fromEntries(form.entries());
  if (!validateRequest(authToken, req.headers.get("x-twilio-signature") ?? "", req.url, params)) return NextResponse.json({ error: "Invalid signature" }, { status: 403 });

  const sid = form.get("MessageSid") ?? form.get("SmsSid");
  const status = form.get("MessageStatus") ?? form.get("SmsStatus");
  if (!sid || !status) return new NextResponse(null, { status: 204 });
  const message = await prisma.message.findFirst({ where: { providerMessageId: sid, direction: "OUTBOUND" } });
  if (!message) return new NextResponse(null, { status: 204 });

  if (status === "delivered") await prisma.message.update({ where: { id: message.id }, data: { status: "DELIVERED", deliveredAt: new Date(), statusDetail: "delivered" } });
  else if (status === "undelivered" || status === "failed") {
    const code = form.get("ErrorCode");
    await prisma.message.update({ where: { id: message.id }, data: { status: "FAILED", statusDetail: code ? `failed (Twilio ${code})` : "failed" } });
    const conv = await prisma.conversation.findUnique({ where: { id: message.conversationId }, select: { businessId: true } });
    await reportFailure("delivery", "SMS delivery failed", { businessId: conv?.businessId, provider: "SMS", meta: { code: code ?? null } });
  } else if (status === "sent") await prisma.message.update({ where: { id: message.id }, data: { statusDetail: "sent" } });
  return new NextResponse(null, { status: 204 });
}
