import { NextResponse } from "next/server";
import { requireMobileRole, isErrorResponse } from "@/lib/mobileApi";
import { getSessionFromRequest, STAFF_ROLES } from "@/lib/auth";
import { reconcileChannels } from "@/app/actions/sync";
import { getInboxVersion } from "@/server/inboxSignal";

/** POST: reconcile every connected channel (the app's pull-to-refresh). GET: the inbox version, for a cheap "anything new?" check. */
export async function POST(req: Request) {
  const ctx = await requireMobileRole(req, [...STAFF_ROLES]);
  if (isErrorResponse(ctx)) return ctx;
  const session = await getSessionFromRequest(req);
  return NextResponse.json(await reconcileChannels(session));
}
export async function GET(req: Request) {
  const ctx = await requireMobileRole(req, [...STAFF_ROLES]);
  if (isErrorResponse(ctx)) return ctx;
  return NextResponse.json({ version: await getInboxVersion(ctx.business.id) });
}
