import { NextResponse } from "next/server";
import { Resend } from "resend";
import { prisma } from "@/lib/db";
import { ingestInboundMessage } from "@/server/leadIngestion";
import { normalizeEmailContent } from "@/lib/emailNormalize";

/**
 * Resend's inbound-email webhook — real, not a placeholder. To activate: verify a
 * domain (or use the free `<id>.resend.app` sandbox address, which needs no DNS at
 * all), set RESEND_INBOUND_DOMAIN to whichever one is receiving mail, then create a
 * webhook in the Resend dashboard subscribed to `email.received` pointed at this URL
 * and copy its signing secret into RESEND_WEBHOOK_SECRET.
 *
 * Routing: each business's inbound address is `<handle>@<RESEND_INBOUND_DOMAIN>` — the
 * `<handle>` local-part is how an incoming email is matched back to the right
 * organization, and it works regardless of which domain is actually configured, so
 * this route never needs to know the domain itself.
 *
 * Signature verification uses Resend's own `webhooks.verify()` (Svix under the hood) —
 * the same SDK method Resend's own docs use, not a hand-rolled check.
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
  } catch (err) {
    console.error("[webhook:email] invalid signature", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  if (event.type !== "email.received") {
    return NextResponse.json({ ok: true });
  }

  try {
    const toAddress = event.data.to[0] ?? "";
    const handle = toAddress.split("@")[0];
    if (!handle) return NextResponse.json({ ok: true }); // malformed recipient — nothing to route

    const business = await prisma.business.findUnique({ where: { handle } });
    if (!business) {
      console.warn(`[webhook:email] no business found for handle "${handle}" (to: ${toAddress})`);
      return NextResponse.json({ ok: true }); // unknown recipient — not an error, just not ours
    }

    const { data: full, error } = await resend.emails.receiving.get(event.data.email_id);
    if (error || !full) {
      console.error("[webhook:email] failed to fetch full email", error);
      return NextResponse.json({ error: "Could not retrieve email content" }, { status: 502 });
    }

    // Bulk mail (newsletters, notifications) reliably carries List-Unsubscribe/List-Id —
    // a genuine customer inquiry never does. Route those into the inbox's junk pile
    // would just be noise; skip ingesting them as a "lead" entirely.
    if (full.headers?.["list-unsubscribe"] || full.headers?.["list-id"] || /\bbulk\b/i.test(full.headers?.["precedence"] ?? "")) {
      return NextResponse.json({ ok: true });
    }

    // Prefer the real text part; fall back to converting the HTML part to readable
    // text (not the subject line) when there's no plain-text alternative — losing the
    // actual message content to "just show the subject" was the previous behavior.
    const body = normalizeEmailContent({ text: full.text, html: full.html });
    const fromEmail = event.data.from;
    // The retrieve API's bare `from` is just the address; the raw header carries the
    // display name when the sender's client set one ("Sarah Johnson <sarah@gmail.com>").
    const fromHeader = full.headers?.["from"];
    const displayNameMatch = fromHeader?.match(/^"?([^"<]+?)"?\s*<.+>$/);
    const fromName = displayNameMatch?.[1]?.trim() || fromEmail.split("@")[0];

    await ingestInboundMessage({
      businessId: business.id,
      channel: "EMAIL",
      senderName: fromName,
      senderHandle: fromEmail,
      body,
      subject: event.data.subject || undefined,
      clientEmail: fromEmail,
      providerMessageId: full.message_id || event.data.email_id,
      rawBody: (full.html || full.text || "").slice(0, 8000) || undefined,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[webhook:email] ingestion failed", err);
    return NextResponse.json({ error: "Internal error processing email" }, { status: 500 });
  }
}
