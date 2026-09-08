import { NextResponse } from "next/server";
import { requireMobileBusiness, requireMobileRole, isErrorResponse, jsonError } from "@/lib/mobileApi";
import { getSessionFromRequest } from "@/lib/auth";
import { listPeople } from "@/server/mobileRead";
import { STAFF_ROLES } from "@/lib/auth";

/** People with evidence of a relationship — a person's conversation, a booking, or a customer — never every sender. */
export async function GET(req: Request) {
  const ctx = await requireMobileRole(req, [...STAFF_ROLES]);
  if (isErrorResponse(ctx)) return ctx;
  const q = (new URL(req.url).searchParams.get("q") ?? "").slice(0, 120);
  return NextResponse.json({ people: await listPeople(ctx.business.id, q) });
}
