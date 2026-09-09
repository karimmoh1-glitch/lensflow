import { NextResponse } from "next/server";
import { requireMobileBusiness, requireMobileRole, isErrorResponse, jsonError } from "@/lib/mobileApi";
import { getSessionFromRequest } from "@/lib/auth";
import { z } from "zod";
import { toggleAutomation, updateAutomation, deleteAutomation } from "@/app/actions/automations";

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

const updateSchema = z.object({ name: z.string(), trigger: z.enum(["BOOKING_CREATED", "DAYS_BEFORE_SHOOT", "SHOOT_COMPLETED", "LEAD_INACTIVE"]), action: z.enum(["SEND_CONFIRMATION", "SEND_QUESTIONNAIRE", "SEND_REMINDER", "SEND_THANK_YOU", "SEND_FOLLOW_UP"]), offsetHours: z.number().int(), messageTemplate: z.string() });
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireMobileBusiness(req);
  if (isErrorResponse(ctx)) return ctx;
  const session = await getSessionFromRequest(req);
  const { id } = await params;
  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("Check the fields.", 400);
  const r = await updateAutomation(id, parsed.data, session);
  return r.error ? jsonError(r.error, 400) : NextResponse.json({ ok: true, paused: r.paused ?? null });
}
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireMobileBusiness(req);
  if (isErrorResponse(ctx)) return ctx;
  const session = await getSessionFromRequest(req);
  const { id } = await params;
  const r = await deleteAutomation(id, session);
  return r.error ? jsonError(r.error, 400) : NextResponse.json({ ok: true });
}
