import { NextResponse } from "next/server";
import { Resend } from "resend";
import { prisma } from "@/lib/db";
import { ingestInboundMessage } from "@/server/leadIngestion";

/**
 * Resend's inbound-email webhook. To activate for real: verify a sending domain with
 * Resend, configure MX records so mail for that domain routes to Resend, then point a
 * webhook at this URL subscribed to the `email.received` event. Signature verification
 * uses Resend's own `webhooks.verify()` (Svix under the hood) — this is the same SDK
 * method Resend's own docs use, not a hand-rolled check.
 *
 * Routing: each business's inbound address is `<handle>@inbound.<your-domain>` — swap
 * in the actual domain once one is verified. The `<handle>` local-part is how an
 * incoming email is matched back to the right organization.
 */
export async function POST(req: Request) {
  const apiKey = process.env.RESEND_API_KEY;
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
  if (!apiKey || !webhookSecret) {
    return NextResponse.json({ error: "Email receiving isn't configured on this deployment." }, { status: 501 });
  }

  const payload = await req.text();
  const resend = new Resend(apiKey);

  let event;
  try {
    event = resend.webhooks.verify({
      payload,
      headers: {
        id: req.headers.get("svix-id") ?? "",
        timestamp: req.headers.get("svix-timestamp") ?? "",
        signature: req.headers.get("svix-signature") ?? "",
      },
      webhookSecret,
    });
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  if (event.type !== "email.received") {
    return NextResponse.json({ ok: true });
  }

  const toAddress = event.data.to[0] ?? "";
  const handle = toAddress.split("@")[0];
  const business = await prisma.business.findUnique({ where: { handle } });
  if (!business) return NextResponse.json({ ok: true }); // unknown recipient — nothing to do

  const full = await resend.emails.receiving.get(event.data.email_id);
  const body = full.data?.text || event.data.subject || "(no content)";
  const fromEmail = event.data.from;
  const fromName = fromEmail.split("@")[0];

  await ingestInboundMessage({
    businessId: business.id,
    channel: "EMAIL",
    senderName: fromName,
    senderHandle: fromEmail,
    body,
    clientEmail: fromEmail,
  });

  return NextResponse.json({ ok: true });
}
