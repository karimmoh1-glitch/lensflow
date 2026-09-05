import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { runScheduledAutomations } from "@/server/automationRunner";
import { runIntegrationMaintenance } from "@/server/integrationMaintenance";

/**
 * Daily sweep of time-based automations (see vercel.json — daily so it runs on every Vercel
 * plan; the windows are sized in hours so a daily pass still catches tomorrow's shoots and
 * this week's balances). Event-driven triggers fire immediately. Vercel Cron calls this with
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
    const summary = await runScheduledAutomations(new Date());
    const maintenance = await runIntegrationMaintenance();
    return NextResponse.json({ ok: true, ...summary, maintenance });
  } catch (err) {
    console.error("[cron/automations] failed", err);
    return NextResponse.json({ error: "Run failed" }, { status: 500 });
  }
}
