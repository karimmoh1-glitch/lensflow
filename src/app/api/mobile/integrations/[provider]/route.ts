import { NextResponse } from "next/server";
import { requireMobileBusiness, requireMobileRole, isErrorResponse, jsonError } from "@/lib/mobileApi";
import { getSessionFromRequest, STAFF_ROLES } from "@/lib/auth";
import { z } from "zod";
import { disconnectIntegration, retrySync, connectAppleCalendar } from "@/app/actions/connect";
import { syncCalendarNow } from "@/app/actions/calendars";
import { disconnectGoogle } from "@/app/actions/googleAuth";
import { syncGmailForBusiness } from "@/server/gmailSync";
import type { IntegrationProvider } from "@prisma/client";
import { syncOutlookForBusiness } from "@/server/outlookSync";
import { syncCalendlyForBusiness } from "@/server/calendlySync";

const PROVIDERS = ["EMAIL", "GOOGLE_CALENDAR", "APPLE_CALENDAR", "INSTAGRAM", "WHATSAPP", "SMS"] as const;
/** What the app can do to a connection without a browser: disconnect, retry a failed sync, sync now, and connect Apple Calendar (an app-specific password, no OAuth). OAuth providers connect on the web. */
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("disconnect") }),
  z.object({ action: z.literal("retry") }),
  z.object({ action: z.literal("sync") }),
  z.object({ action: z.literal("connect_apple"), appleId: z.string().trim().email(), appSpecificPassword: z.string().min(16).max(24) }),
]);
export async function POST(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const ctx = await requireMobileRole(req, ["OWNER", "ADMIN"]);
  if (isErrorResponse(ctx)) return ctx;
  const session = await getSessionFromRequest(req);
  const { provider } = await params;
  if (!PROVIDERS.includes(provider as (typeof PROVIDERS)[number])) return jsonError("Unknown provider", 404);
  const p = provider as IntegrationProvider;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("Unknown action", 400);
  const a = parsed.data;
  try {
    if (a.action === "disconnect") {
      if (p === "EMAIL" || p === "GOOGLE_CALENDAR" || p === "GOOGLE_DRIVE") { await disconnectGoogle(p, session); return NextResponse.json({ ok: true }); }
      const r = await disconnectIntegration(p, session); return r.error ? jsonError(r.error, 400) : NextResponse.json({ ok: true });
    }
    if (a.action === "retry") { const r = await retrySync(p, session); return r.ok ? NextResponse.json({ ok: true }) : jsonError(r.error ?? "Still failing", 400); }
    if (a.action === "sync") {
      if (p === "EMAIL") { const r = await syncGmailForBusiness(ctx.business.id); return r.ok ? NextResponse.json({ ok: true, found: r.found, ingested: r.ingested }) : jsonError(r.error, 400); }
      if (p === "GOOGLE_CALENDAR" || p === "APPLE_CALENDAR" || p === "MICROSOFT_CALENDAR") { const r = await syncCalendarNow(p, session); return r.ok ? NextResponse.json({ ok: true, upserted: r.upserted ?? 0 }) : jsonError(r.error ?? "Sync failed", 400); }
      if (p === "MICROSOFT_OUTLOOK") { const r = await syncOutlookForBusiness(ctx.business.id); return r.ok ? NextResponse.json({ ok: true, found: r.found, ingested: r.ingested }) : jsonError(r.error, 400); }
      if (p === "CALENDLY") { const r = await syncCalendlyForBusiness(ctx.business.id); return r.ok ? NextResponse.json({ ok: true, found: r.found, ingested: r.created }) : jsonError(r.error, 400); }
      return jsonError("This channel delivers on its own; nothing to sync.", 400);
    }
    if (p !== "APPLE_CALENDAR") return jsonError("Only Apple Calendar connects this way.", 400);
    const r = await connectAppleCalendar(a.appleId, a.appSpecificPassword, session);
    return "error" in r && r.error ? jsonError(r.error, 400) : NextResponse.json({ ok: true });
  } catch (e) { return jsonError(e instanceof Error && e.message !== "unauthorized" ? e.message : "Not allowed", 403); }
}
