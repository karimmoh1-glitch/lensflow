import { NextResponse } from "next/server";
import { readBoundedText } from "@/lib/http";
import { prisma } from "@/lib/db";
import { calendlyConfigured, calendlySigningKey, verifyCalendlySignature, type CalendlyWebhookPayload } from "@/lib/calendly";
import { processCalendlyWebhook } from "@/server/calendlySync";
import { runWebhook } from "@/server/webhookInbox";
import { rateLimit, clientIpFrom } from "@/lib/rateLimit";

/** A body can only be read once, so each rejection needs its own response object. */
const rejected = () => NextResponse.json({ error: "Invalid signature" }, { status: 401 });

/**
 * Calendly → Daythread. Every subscription Daythread creates carries its own signing key
 * (derived, never stored); the event's `created_by` user routes it to that connection and
 * the signature is checked against that connection's key. Anything that doesn't verify is
 * a 401, and nothing about it is stored.
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!calendlyConfigured()) return NextResponse.json({ error: "Calendly isn't configured on this deployment." }, { status: 501 });
  // Routing costs a database read before anything is verified, because the signing key is
  // per-connection. Meter it so that read cannot be driven by a stranger.
  if (!rateLimit(`calendly-hook:${clientIpFrom(req.headers)}`, { limit: 600, windowMs: 60 * 60 * 1000 }).ok) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  let raw: string;
  try {
    raw = await readBoundedText(req, 256 * 1024);
  } catch {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }
  let payload: CalendlyWebhookPayload;
  try {
    payload = JSON.parse(raw) as CalendlyWebhookPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const userUri = typeof payload.created_by === "string" ? payload.created_by : null;
  if (!userUri) return NextResponse.json({ error: "Unroutable" }, { status: 400 });
  const row = await prisma.integration.findFirst({ where: { provider: "CALENDLY", externalId: userUri } });
  // Same answer whether the Calendly user is unknown here or the signature is wrong —
  // otherwise this route tells a stranger which Calendly accounts use Daythread.
  if (!row) return rejected();
  if (!verifyCalendlySignature(raw, req.headers.get("calendly-webhook-signature"), calendlySigningKey(row.id))) return rejected();
  if (row.status === "NOT_CONNECTED") return NextResponse.json({ ok: true, ignored: "disconnected" });
  // The connection is always part of the key. Without it the fallback was event name, body
  // length and a second-resolution timestamp, so two workspaces receiving the same kind of
  // event in the same second collided and the second booking was dropped as a duplicate.
  const eventId = `${row.id}:${payload.event}:${payload.payload?.uri ?? `len${raw.length}`}:${payload.created_at ?? ""}`;
  const run = await runWebhook("calendly", eventId, { ...payload, __integrationId: row.id }, async (p) => { await processCalendlyWebhook(p, row); }, { businessId: row.businessId });
  if (run.status === "duplicate") return NextResponse.json({ ok: true, duplicate: true });
  if (run.status === "processed") return NextResponse.json({ ok: true });
  return NextResponse.json({ error: "Internal error processing event" }, { status: run.status === "dead" ? 200 : 500 });
}
