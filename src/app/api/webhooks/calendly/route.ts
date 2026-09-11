import { NextResponse } from "next/server";
import { readBoundedText } from "@/lib/http";
import { prisma } from "@/lib/db";
import { calendlyConfigured, calendlySigningKey, verifyCalendlySignature, type CalendlyWebhookPayload } from "@/lib/calendly";
import { processCalendlyWebhook } from "@/server/calendlySync";
import { runWebhook } from "@/server/webhookInbox";

/**
 * Calendly → Daythread. Every subscription Daythread creates carries its own signing key
 * (derived, never stored); the event's `created_by` user routes it to that connection and
 * the signature is checked against that connection's key. Anything that doesn't verify is
 * a 401, and nothing about it is stored.
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!calendlyConfigured()) return NextResponse.json({ error: "Calendly isn't configured on this deployment." }, { status: 501 });
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
  if (!row) return NextResponse.json({ error: "Unknown subscription" }, { status: 401 });
  if (!verifyCalendlySignature(raw, req.headers.get("calendly-webhook-signature"), calendlySigningKey(row.id))) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
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
