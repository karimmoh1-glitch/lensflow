import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { readBoundedText } from "@/lib/http";
import { rateLimit, clientIpFrom } from "@/lib/rateLimit";
import { zoomWebhooksConfigured, verifyZoomSignature, zoomUrlValidationResponse, type ZoomEnvelope } from "@/lib/zoom";
import { runWebhook } from "@/server/webhookInbox";
import { recordAudit } from "@/server/audit";

/**
 * Zoom → Daythread. Two things, both about the connection rather than any meeting:
 *
 *   - `endpoint.url_validation`, Zoom proving the URL when it is saved in the Marketplace;
 *   - `app_deauthorized`, a user removing Daythread from their Zoom account. Zoom requires
 *     the app to delete that user's data, so the tokens are erased, not merely flagged.
 *
 * The signature is checked against the exact bytes before anything is parsed, including
 * for URL validation. The Zoom user named in the signed payload picks the row, and the
 * account id must match what Daythread recorded at connect, so a payload naming a user
 * id alone cannot reach a connection. Each deauthorization is claimed once.
 */
export const dynamic = "force-dynamic";

const ok = (extra: Record<string, unknown> = {}) => NextResponse.json({ ok: true, ...extra });

export async function POST(req: Request) {
  if (!zoomWebhooksConfigured()) return NextResponse.json({ error: "Zoom webhooks aren't configured on this deployment." }, { status: 501 });
  if (!rateLimit(`zoom-hook:${clientIpFrom(req.headers)}`, { limit: 600, windowMs: 60 * 60 * 1000 }).ok) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  let raw: string;
  try {
    raw = await readBoundedText(req, 64 * 1024);
  } catch {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }
  if (!verifyZoomSignature(raw, req.headers.get("x-zm-signature"), req.headers.get("x-zm-request-timestamp"))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }
  let envelope: ZoomEnvelope;
  try {
    envelope = JSON.parse(raw) as ZoomEnvelope;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (envelope.event === "endpoint.url_validation") {
    const plain = envelope.payload?.plainToken;
    if (typeof plain !== "string" || !plain || plain.length > 256) return NextResponse.json({ error: "Invalid challenge" }, { status: 400 });
    return NextResponse.json(zoomUrlValidationResponse(plain));
  }

  if (envelope.event !== "app_deauthorized") return ok({ ignored: typeof envelope.event === "string" ? envelope.event.slice(0, 64) : "unknown" });

  const p = envelope.payload;
  if (typeof p?.user_id !== "string" || typeof p.account_id !== "string" || !p.user_id || !p.account_id) return NextResponse.json({ error: "Malformed event" }, { status: 400 });
  // Zoom gives every deauthorization its own `signature` id; fall back to user and time.
  const eventId = typeof p.signature === "string" && p.signature ? p.signature : `${p.user_id}:${p.deauthorization_time ?? envelope.event_ts ?? ""}`;

  const run = await runWebhook("zoom", eventId.slice(0, 200), { userId: p.user_id, accountId: p.account_id }, async ({ userId, accountId }) => {
    const rows = await prisma.integration.findMany({ where: { provider: "ZOOM", externalId: userId, status: { not: "NOT_CONNECTED" } }, select: { id: true, businessId: true, settings: true } });
    for (const row of rows) {
      // The account id recorded at connect must agree with the event's.
      if ((row.settings as { accountId?: string } | null)?.accountId !== accountId) continue;
      await prisma.integration.update({
        where: { id: row.id },
        data: { status: "NOT_CONNECTED", accessToken: null, refreshToken: null, tokenExpiresAt: null, externalId: null, externalAccount: null, scopes: null, settings: {}, lastError: "Daythread was removed from your Zoom account.", lastErrorAt: new Date(), lastSyncStatus: null },
      });
      await recordAudit({ businessId: row.businessId, action: "integration.revoked_by_provider", targetType: "integration", targetId: row.id, metadata: { provider: "ZOOM", event: "app_deauthorized" } });
    }
  });
  if (run.status === "duplicate") return ok({ duplicate: true });
  if (run.status === "processed") return ok();
  return NextResponse.json({ error: "Internal error processing event" }, { status: run.status === "dead" ? 200 : 500 });
}
