import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { prisma } from "@/lib/db";
import { verifyMetaSignature, safeEqual } from "@/lib/meta/common";
import { processMetaEnvelope, type MetaEnvelope } from "@/server/metaInbound";
import { reportFailure } from "@/lib/observe";
import { rateLimit } from "@/lib/rateLimit";

/**
 * Meta's webhook for Instagram messaging and the WhatsApp Cloud API. One URL for both:
 * https://daythread.org/api/webhooks/meta
 *
 * GET is Meta's verification handshake (hub.verify_token must equal our
 * META_WEBHOOK_VERIFY_TOKEN, compared in constant time). POST carries X-Hub-Signature-256,
 * an HMAC of the raw body with the app secret, verified before the body is parsed.
 * Instagram (Instagram Login) events are signed with the Instagram app secret; WhatsApp
 * events with the Meta app secret. When both are configured the product is held to the
 * secret that can legitimately sign it, so one product's secret can never inject events
 * into the other.
 *
 * Nothing in the query string, and nothing the sender puts in the body beyond the provider
 * account id, decides ownership: the Integration row that holds that account id decides,
 * and only rows whose credentials still work.
 *
 * Idempotent on a hash of the raw body — Meta retries deliveries, and a retry is
 * acknowledged without being reprocessed. A processing failure releases the claim so
 * Meta's retry is actually processed rather than swallowed as a duplicate.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Meta's own limit is 8 MB per delivery; anything larger is not from Meta. */
const MAX_BODY_BYTES = 1_000_000;

function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd ? fwd.split(",")[0].trim() : req.headers.get("x-real-ip")) || "unknown";
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const expected = process.env.META_WEBHOOK_VERIFY_TOKEN;
  if (!expected) return NextResponse.json({ error: "Meta webhooks aren't configured on this deployment." }, { status: 501 });
  const mode = url.searchParams.get("hub.mode");
  const challenge = url.searchParams.get("hub.challenge");
  if (mode === "subscribe" && safeEqual(url.searchParams.get("hub.verify_token"), expected) && challenge) {
    return new NextResponse(challenge, { status: 200, headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" } });
  }
  return NextResponse.json({ error: "Verification failed" }, { status: 403 });
}

export async function POST(req: Request) {
  const metaSecret = process.env.META_APP_SECRET;
  const igSecret = process.env.INSTAGRAM_APP_SECRET;
  if (!metaSecret && !igSecret) {
    return NextResponse.json({ error: "Meta webhooks aren't configured on this deployment." }, { status: 501 });
  }

  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return NextResponse.json({ error: "Payload too large" }, { status: 413 });

  const signature = req.headers.get("x-hub-signature-256");
  const matched = { meta: Boolean(metaSecret) && verifyMetaSignature(raw, signature, metaSecret!), instagram: Boolean(igSecret) && verifyMetaSignature(raw, signature, igSecret!) };
  if (!matched.meta && !matched.instagram) {
    // A script forging signatures gets a cheap 401 and then nothing; genuine Meta traffic
    // is signed and never reaches this branch.
    const brake = rateLimit(`meta-webhook-bad-sig:${clientIp(req)}`, { limit: 20, windowMs: 60_000 });
    if (!brake.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": String(brake.retryAfterSeconds) } });
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let env: MetaEnvelope;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || typeof (parsed as MetaEnvelope).object !== "string" || !Array.isArray((parsed as MetaEnvelope).entry)) throw new Error("malformed");
    env = parsed as MetaEnvelope;
  } catch {
    return NextResponse.json({ error: "Malformed event" }, { status: 400 });
  }

  // WhatsApp Business Account events are signed by the Meta app that owns the subscription.
  // If that secret is configured, a WhatsApp event signed only by the Instagram secret is
  // not a WhatsApp event we should trust.
  if (env.object === "whatsapp_business_account" && metaSecret && !matched.meta) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const eventId = createHash("sha256").update(raw).digest("hex");
  try {
    await prisma.webhookEvent.create({ data: { provider: "meta", eventId } });
  } catch {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  try {
    const result = await processMetaEnvelope(env);
    void pruneOldEvents();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    await reportFailure("webhook", `Meta ${env.object} processing failed`, { provider: env.object, error: err });
    // Release the idempotency claim so Meta's retry is processed rather than deduped away.
    await prisma.webhookEvent.deleteMany({ where: { provider: "meta", eventId } }).catch(() => {});
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}

/** The dedupe table only needs to outlive Meta's retry window (hours). Pruned occasionally
 * rather than on a schedule so it never needs its own cron. */
async function pruneOldEvents(): Promise<void> {
  if (Math.random() > 0.02) return;
  await prisma.webhookEvent
    .deleteMany({ where: { provider: "meta", receivedAt: { lt: new Date(Date.now() - 7 * 86400000) } } })
    .catch(() => {});
}
