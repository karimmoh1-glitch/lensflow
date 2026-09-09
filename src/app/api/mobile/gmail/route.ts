import { NextResponse } from "next/server";
import { requireMobileBusiness, requireMobileRole, isErrorResponse, jsonError } from "@/lib/mobileApi";
import { getSessionFromRequest, STAFF_ROLES } from "@/lib/auth";
import { reconcileChannels } from "@/app/actions/sync";
/** Pull Gmail now — the same throttled sync the web's inbox runs on open. */
export async function POST(req: Request) {
  const ctx = await requireMobileRole(req, [...STAFF_ROLES]);
  if (isErrorResponse(ctx)) return ctx;
  const session = await getSessionFromRequest(req);
  // Kept for older app builds: now reconciles every connected channel, not only Gmail.
  const r = await reconcileChannels(session);
  return NextResponse.json({ ok: r.ok, found: r.results.reduce((n, x) => n + (x.found ?? 0), 0), ingested: r.ingested, results: r.results }, { status: r.error === "unauthorized" ? 403 : 200 });
}
