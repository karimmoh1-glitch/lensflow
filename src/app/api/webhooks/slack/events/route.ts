import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { readBoundedText } from "@/lib/http";
import { rateLimit, clientIpFrom } from "@/lib/rateLimit";
import { slackEventsConfigured, verifySlackSignature, parseSlackEvent, type SlackEventEnvelope } from "@/lib/slack";
import { runWebhook } from "@/server/webhookInbox";
import { recordAudit } from "@/server/audit";
import { reportFailure } from "@/lib/observe";

/**
 * Slack → Daythread. Daythread reads nothing from Slack; the only events that matter are
 * the ones about the installation itself — the app was removed from a workspace, or its
 * token was revoked — so the row stops claiming a connection that no longer exists and
 * the owner is told to reconnect rather than watching notices silently fail.
 *
 * Order of operations: the signature is checked against the exact bytes before anything
 * is parsed; Slack's own URL verification is answered; the event is claimed by Slack's
 * event id so a retry (Slack sends up to three) is answered "duplicate"; the workspace
 * named in the signed payload picks the rows, and nothing else does. Every workspace
 * that installed the same Slack team is affected together, because the same token died
 * for all of them.
 */
export const dynamic = "force-dynamic";

const ok = (extra: Record<string, unknown> = {}) => NextResponse.json({ ok: true, ...extra });

export async function POST(req: Request) {
  if (!slackEventsConfigured()) return NextResponse.json({ error: "Slack events aren't configured on this deployment." }, { status: 501 });
  if (!rateLimit(`slack-events:${clientIpFrom(req.headers)}`, { limit: 600, windowMs: 60 * 60 * 1000 }).ok) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  let raw: string;
  try {
    raw = await readBoundedText(req, 256 * 1024);
  } catch {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }
  if (!verifySlackSignature(raw, req.headers.get("x-slack-signature"), req.headers.get("x-slack-request-timestamp"))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let envelope: SlackEventEnvelope;
  try {
    envelope = JSON.parse(raw) as SlackEventEnvelope;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Slack proves the URL by asking for its challenge back, in plain text.
  if (envelope.type === "url_verification") {
    const challenge = (envelope as { challenge?: unknown }).challenge;
    if (typeof challenge !== "string" || challenge.length > 512) return NextResponse.json({ error: "Invalid challenge" }, { status: 400 });
    return new NextResponse(challenge, { status: 200, headers: { "content-type": "text/plain" } });
  }

  const event = parseSlackEvent(envelope);
  if (!event) return ok({ ignored: envelope.type ?? "unknown" });
  if (event.kind === "other") return ok({ ignored: event.type });

  const run = await runWebhook("slack", event.eventId, { teamId: event.teamId, kind: event.kind }, async (p) => {
    await installationRevoked(p.teamId, p.kind);
  });
  if (run.status === "duplicate") return ok({ duplicate: true });
  if (run.status === "processed") return ok();
  return NextResponse.json({ error: "Internal error processing event" }, { status: run.status === "dead" ? 200 : 500 });
}

/**
 * Slack has told us the token for this workspace is dead. Keeping it would mean every
 * notice from now on fails at Slack and is recorded as a mysterious refusal; dropping it
 * and marking the row is what lets the card say "reconnect" instead.
 */
async function installationRevoked(teamId: string, kind: "app_uninstalled" | "tokens_revoked") {
  const rows = await prisma.integration.findMany({ where: { provider: "SLACK", externalId: teamId, status: { not: "NOT_CONNECTED" } }, select: { id: true, businessId: true, settings: true } });
  for (const row of rows) {
    const settings = (row.settings ?? {}) as Record<string, unknown>;
    await prisma.integration.update({
      where: { id: row.id },
      data: {
        status: "NEEDS_ATTENTION",
        accessToken: null,
        refreshToken: null,
        lastError: kind === "app_uninstalled" ? "Daythread was removed from your Slack workspace — reconnect to keep getting notices." : "Slack revoked Daythread's access — reconnect.",
        lastErrorAt: new Date(),
        lastSyncStatus: "failed",
        settings: { ...settings, lastPostError: "auth" },
      },
    });
    await recordAudit({ businessId: row.businessId, action: "integration.revoked_by_provider", targetType: "integration", targetId: row.id, metadata: { provider: "SLACK", event: kind } });
  }
  if (rows.length === 0) await reportFailure("webhook", "Slack revocation for a workspace nobody connected", { provider: "SLACK", level: "warn" });
}
