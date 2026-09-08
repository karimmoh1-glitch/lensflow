import { NextResponse } from "next/server";
import { requireMobileBusiness, requireMobileRole, isErrorResponse, jsonError } from "@/lib/mobileApi";
import { getSessionFromRequest } from "@/lib/auth";
import { z } from "zod";
import { deleteWorkspace } from "@/app/actions/settings";

const schema = z.object({ confirmName: z.string() });

/** Deletes the workspace (and the account when it was the last one) — the same path as Settings → Danger zone, including the Stripe cancellation that must succeed first. */
export async function DELETE(req: Request) {
  const ctx = await requireMobileBusiness(req);
  if (isErrorResponse(ctx)) return ctx;
  const session = await getSessionFromRequest(req);
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("Type the workspace name to confirm.", 400);
  try {
    const r = await deleteWorkspace(parsed.data.confirmName, session);
    if (r && "error" in r && r.error) return jsonError(r.error, 400);
    return NextResponse.json({ ok: true });
  } catch {
    return jsonError("Only the owner can delete the workspace.", 403);
  }
}
