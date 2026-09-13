import { NextResponse } from "next/server";
import { readBoundedText } from "@/lib/http";
import { rateLimit, clientIpFrom } from "@/lib/rateLimit";
import { zoomWebhooksConfigured, verifyZoomSignature, zoomUrlValidationResponse } from "@/lib/zoom";
import { runWebhook } from "@/server/webhookInbox";
import { ZOOM_DM_EVENTS, parseZoomDmEvent, processZoomDmEvent, processZoomDeauthorization, type ZoomDmEventName } from "@/server/zoomChat";

/**
 * Zoom → Daythread. Exactly four events, and nothing else is processed:
 *
 *   - `endpoint.url_validation`: Zoom proving the URL when the subscription is saved;
 *   - `app_deauthorized`: a user removed Daythread from Zoom; their tokens are erased;
 *   - `team_chat.dm_message_posted` / `_updated` / `_deleted`: direct messages with people
 *     outside the connected Zoom account, into the Inbox (see server/zoomChat.ts).
 *
 * Order of operations: the body is read with a hard ceiling; the signature is checked
 * against those exact bytes before anything is parsed, including for URL validation;
 * the event name is checked against the list above; the payload is validated field by
 * field; the event is claimed once in the webhook inbox; and the workspace comes only from
 * the signed payload matched to a stored connection by Zoom user id and account id.
 *
 * Zoom expects an answer within three seconds and redelivers on a 5xx or a timeout, so the
 * handlers do no model calls, and a redelivery is answered "duplicate".
 */
export const dynamic = "force-dynamic";

const ok = (extra: Record<string, unknown> = {}) => NextResponse.json({ ok: true, ...extra });
const MAX_BODY_BYTES = 64 * 1024;

export async function POST(req: Request) {
  if (!zoomWebhooksConfigured()) return NextResponse.json({ error: "Zoom webhooks aren't configured on this deployment." }, { status: 501 });
  let raw: string;
  try {
    raw = await readBoundedText(req, MAX_BODY_BYTES);
  } catch {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }
  if (!verifyZoomSignature(raw, req.headers.get("x-zm-signature"), req.headers.get("x-zm-request-timestamp"))) {
    // Only unsigned traffic is throttled. Signed deliveries come from Zoom, and a chat-heavy
    // account must never be locked out of its own messages by a per-address cap.
    if (!rateLimit(`zoom-hook-bad-sig:${clientIpFrom(req.headers)}`, { limit: 60, windowMs: 10 * 60 * 1000 }).ok) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }
  let envelope: { event?: unknown; event_ts?: unknown; payload?: Record<string, unknown> };
  try {
    envelope = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!envelope || typeof envelope !== "object" || typeof envelope.event !== "string" || envelope.event.length > 64) {
    return NextResponse.json({ error: "Malformed event" }, { status: 400 });
  }

  if (envelope.event === "endpoint.url_validation") {
    const plain = envelope.payload?.plainToken;
    if (typeof plain !== "string" || !plain || plain.length > 256) return NextResponse.json({ error: "Invalid challenge" }, { status: 400 });
    return NextResponse.json(zoomUrlValidationResponse(plain));
  }

  if (envelope.event === "app_deauthorized") {
    const p = envelope.payload ?? {};
    if (typeof p.user_id !== "string" || typeof p.account_id !== "string" || !p.user_id || !p.account_id || p.user_id.length > 128 || p.account_id.length > 128) {
      return NextResponse.json({ error: "Malformed event" }, { status: 400 });
    }
    // Zoom gives every deauthorization its own `signature` id; fall back to user and time.
    const eventId = typeof p.signature === "string" && p.signature ? p.signature : `${p.user_id}:${String(p.deauthorization_time ?? envelope.event_ts ?? "")}`;
    const payload = { kind: "deauthorized" as const, userId: p.user_id, accountId: p.account_id };
    return respond(await runWebhook("zoom", eventId.slice(0, 200), payload, async (x) => processZoomDeauthorization(x)));
  }

  if ((ZOOM_DM_EVENTS as readonly string[]).includes(envelope.event)) {
    const evt = parseZoomDmEvent(envelope);
    if (!evt) return NextResponse.json({ error: "Malformed event" }, { status: 400 });
    // Every edit of a message is its own event; the event time tells them apart.
    const eventId = `${evt.event as ZoomDmEventName}:${evt.payload.object.message_id}:${evt.event_ts}`;
    let outcome: Awaited<ReturnType<typeof processZoomDmEvent>> | undefined;
    const run = await runWebhook("zoom", eventId.slice(0, 200), { kind: "dm" as const, event: evt }, async (x) => {
      outcome = await processZoomDmEvent(x.event);
    });
    // Only codes and ids go back to Zoom; never message text, names or addresses.
    if (run.status === "processed" && outcome?.status === "ignored") return ok({ ignored: outcome.reason });
    if (run.status === "processed" && outcome?.status === "duplicate") return ok({ duplicate: true });
    return respond(run);
  }

  // Subscribed to something Daythread doesn't handle (channel messages, meeting chat…):
  // acknowledged so Zoom doesn't redeliver, and nothing is stored.
  return ok({ ignored: envelope.event.slice(0, 64) });
}

function respond(run: Awaited<ReturnType<typeof runWebhook>>) {
  if (run.status === "duplicate") return ok({ duplicate: true });
  if (run.status === "processed") return ok();
  // A dead letter is acknowledged so Zoom stops; a failure asks Zoom to redeliver.
  return NextResponse.json({ error: "Internal error processing event" }, { status: run.status === "dead" ? 200 : 500 });
}
