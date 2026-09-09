import { NextResponse } from "next/server";
import { readBoundedText } from "@/lib/http";
import { validateRequest } from "twilio";
import { prisma } from "@/lib/db";
import { reportFailure } from "@/lib/observe";
import { markWebhookSeen } from "@/server/inboxSignal";

/**
 * Twilio's message status callback (queued → sent → delivered / undelivered / failed).
 * Signature-verified like the inbound webhook. The message is found by its Twilio SID
 * (our providerMessageId) and only ever moves to a state Twilio reported — a failed text
 * shows as failed with Twilio's error code, never as sent.
 */
export async function POST(req: Request) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) return NextResponse.json({ error: "SMS isn't configured on this deployment." }, { status: 501 });
  let raw: string;
  try {
    raw = await readBoundedText(req, 64 * 1024);
  } catch {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }
  const form = new URLSearchParams(raw);
  const params = Object.fromEntries(form.entries());
  if (!validateRequest(authToken, req.headers.get("x-twilio-signature") ?? "", req.url, params)) return NextResponse.json({ error: "Invalid signature" }, { status: 403 });

  const sid = form.get("MessageSid") ?? form.get("SmsSid");
  const status = form.get("MessageStatus") ?? form.get("SmsStatus");
  if (!sid || !status) return new NextResponse(null, { status: 204 });
  // Scoped to SMS threads, and to the workspace whose number the callback names.
  const from = form.get("From");
  const shared = Boolean(from && process.env.TWILIO_FROM_NUMBER && from === process.env.TWILIO_FROM_NUMBER);
  const business = from && !shared ? await prisma.business.findUnique({ where: { twilioPhoneNumber: from }, select: { id: true } }) : null;
  // A callback for a number no workspace owns (and that isn't the shared fallback sender) moves nothing.
  if (from && !shared && !business) return new NextResponse(null, { status: 204 });
  const message = await prisma.message.findFirst({ where: { providerMessageId: sid, direction: "OUTBOUND", conversation: { channel: "SMS", ...(business ? { businessId: business.id } : {}) } } });
  if (!message) return new NextResponse(null, { status: 204 });
  // Twilio can redeliver an earlier status after a later one; a state never moves backwards.
  const RANK: Record<string, number> = { queued: 0, accepted: 0, sending: 0, sent: 1, delivered: 2, read: 3, undelivered: 9, failed: 9 };
  if ((RANK[status] ?? 0) <= (RANK[message.statusDetail?.replace(/ .*/, "") ?? ""] ?? 0)) return new NextResponse(null, { status: 204 });

  if (status === "delivered") await prisma.message.update({ where: { id: message.id }, data: { status: "DELIVERED", deliveredAt: message.deliveredAt ?? new Date(), statusDetail: "delivered" } });
  else if (status === "undelivered" || status === "failed") {
    const code = form.get("ErrorCode");
    await prisma.message.update({ where: { id: message.id }, data: { status: "FAILED", statusDetail: code ? `failed (Twilio ${code})` : "failed" } });
    const conv = await prisma.conversation.findUnique({ where: { id: message.conversationId }, select: { businessId: true } });
    await reportFailure("delivery", "SMS delivery failed", { businessId: conv?.businessId, provider: "SMS", meta: { code: code ?? null } });
    if (conv) await markWebhookSeen(conv.businessId, "SMS");
  } else if (status === "sent") await prisma.message.update({ where: { id: message.id }, data: { statusDetail: "sent" } });
  return new NextResponse(null, { status: 204 });
}
