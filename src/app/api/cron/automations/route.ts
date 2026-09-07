import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { runIntegrationMaintenance } from "@/server/integrationMaintenance";
import { syncAllGmail } from "@/server/gmailSync";
import { runScheduledAutomations } from "@/server/automationRunner";

/**
 * The daily run (see vercel.json), in order: pull every connected Gmail so the sweep sees
 * today's mail; run the time-based automations — reminders before a booking, follow-ups
 * after one, quiet-lead nudges — each idempotent per (automation, target); then channel
 * maintenance: refresh Instagram tokens before they expire and flag credentials that
 * stopped working. Vercel Cron calls this with
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
    const gmail = await syncAllGmail({ budgetMs: 25_000 });
    const automations = await runScheduledAutomations();
    const maintenance = await runIntegrationMaintenance();
    return NextResponse.json({ ok: true, gmail, automations, maintenance });
  } catch (err) {
    console.error("[cron/automations] failed", err);
    return NextResponse.json({ error: "Run failed" }, { status: 500 });
  }
}
