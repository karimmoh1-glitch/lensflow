import { NextResponse } from "next/server";
import { requireMobileBusiness, requireMobileRole, isErrorResponse, jsonError } from "@/lib/mobileApi";
import { getSessionFromRequest } from "@/lib/auth";
import { z } from "zod";
import { toggleAutomation } from "@/app/actions/automations";

const schema = z.object({ enabled: z.boolean() });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireMobileBusiness(req);
  if (isErrorResponse(ctx)) return ctx;
  const session = await getSessionFromRequest(req);
  const { id } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("enabled must be true or false", 400);
  try {
    const r = await toggleAutomation(id, parsed.data.enabled, session);
    if (r.error) return jsonError(r.error, 402);
    return NextResponse.json({ ok: true });
  } catch {
    return jsonError("Unauthorized", 403);
  }
}
