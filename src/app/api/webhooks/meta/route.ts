import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { prisma } from "@/lib/db";
import { verifyMetaSignature } from "@/lib/meta/common";
import { processMetaEnvelope, type MetaEnvelope } from "@/server/metaInbound";
import { reportFailure } from "@/lib/observe";

/**
 * Meta's webhook for Instagram messaging and the WhatsApp Cloud API. One URL for both:
 * https://daythread.org/api/webhooks/meta
 *
 * GET is Meta's verification handshake (hub.verify_token must equal our
 * META_WEBHOOK_VERIFY_TOKEN). POST carries X-Hub-Signature-256, an HMAC of the raw body with
 * the app secret — verified in constant time before the body is even parsed. Instagram
 * (Instagram Login) events are signed with the Instagram app secret; WhatsApp events with
 * the Meta app secret; both are accepted. Idempotent on a hash of the raw body: Meta
 * retries deliveries, and a retry is acknowledged without being reprocessed. A processing
 * failure releases the claim so the retry is processed.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const expected = process.env.META_WEBHOOK_VERIFY_TOKEN;
  if (!expected) return NextResponse.json({ error: "Meta webhooks aren't configured on this deployment." }, { status: 501 });
  if (mode === "subscribe" && token === expected && challenge) return new NextResponse(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  return NextResponse.json({ error: "Verification failed" }, { status: 403 });
}

export async function POST(req: Request) {
  const secrets = [process.env.META_APP_SECRET, process.env.INSTAGRAM_APP_SECRET].filter((s): s is string => Boolean(s));
  if (secrets.length === 0) return NextResponse.json({ error: "Meta webhooks aren't configured on this deployment." }, { status: 501 });
  const raw = await req.text();
  const signature = req.headers.get("x-hub-signature-256");
  if (!secrets.some((s) => verifyMetaSignature(raw, signature, s))) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });

  let env: MetaEnvelope;
  try {
    env = JSON.parse(raw);
    if (!env || typeof env.object !== "string" || !Array.isArray(env.entry)) throw new Error("malformed");
  } catch {
    return NextResponse.json({ error: "Malformed event" }, { status: 400 });
  }

  const eventId = createHash("sha256").update(raw).digest("hex");
  try {
    await prisma.webhookEvent.create({ data: { provider: "meta", eventId } });
  } catch {
    return NextResponse.json({ ok: true, duplicate: true });
  }
  try {
    const result = await processMetaEnvelope(env);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    await reportFailure("webhook", `Meta ${env.object} processing failed`, { provider: env.object, error: err });
    await prisma.webhookEvent.deleteMany({ where: { provider: "meta", eventId } }).catch(() => {});
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}
