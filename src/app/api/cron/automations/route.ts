import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { runIntegrationMaintenance } from "@/server/integrationMaintenance";
import { syncAllGmail } from "@/server/gmailSync";

/**
 * Daily maintenance for connected channels (see vercel.json): refresh Instagram tokens before
 * they expire and flag credentials that stopped working. Vercel Cron calls this with
 * `Authorization: Bearer $CRON_SECRET`; anything else is rejected. With no CRON_SECRET
 * configured the route refuses to run rather than running unauthenticated.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not configured." }, { status: 501 });
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const maintenance = await runIntegrationMaintenance();
    // Pull every connected Gmail so "waiting for your reply" and follow-ups reflect today's
    // mail even for a workspace nobody opened; the inbox and Today also pull on open.
    const gmail = await syncAllGmail();
    return NextResponse.json({ ok: true, maintenance, gmail });
  } catch (err) {
    console.error("[cron/automations] failed", err);
    return NextResponse.json({ error: "Run failed" }, { status: 500 });
  }
}
