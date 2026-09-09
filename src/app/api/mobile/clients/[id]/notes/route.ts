import { NextResponse } from "next/server";
import { requireMobileBusiness, requireMobileRole, isErrorResponse, jsonError } from "@/lib/mobileApi";
import { getSessionFromRequest, STAFF_ROLES } from "@/lib/auth";
import { z } from "zod";
import { addClientNote } from "@/app/actions/clients";
const schema = z.object({ body: z.string().trim().min(1).max(2000) });
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireMobileRole(req, [...STAFF_ROLES]);
  if (isErrorResponse(ctx)) return ctx;
  const session = await getSessionFromRequest(req);
  const { id } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("Write a note.", 400);
  try { await addClientNote(id, parsed.data.body, session); return NextResponse.json({ ok: true }); } catch (e) { return jsonError(e instanceof Error ? e.message : "Couldn't save the note", 400); }
}
