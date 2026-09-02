import { NextResponse } from "next/server";
import { getSessionFromRequest, requireBusiness, requireRole, type BusinessContext } from "@/lib/auth";
import type { Role } from "@prisma/client";

export function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

/** Resolves the authenticated org context for a mobile API request from its
 * `Authorization: Bearer` header — the same membership/tenant-isolation logic the web
 * dashboard uses, just fed a bearer session instead of a cookie session. */
export async function requireMobileBusiness(req: Request): Promise<BusinessContext | NextResponse> {
  const session = await getSessionFromRequest(req);
  if (!session) return jsonError("Unauthorized", 401);
  const ctx = await requireBusiness(session);
  if (!ctx) return jsonError("Unauthorized", 401);
  return ctx;
}

export async function requireMobileRole(req: Request, roles: Role[]): Promise<BusinessContext | NextResponse> {
  const session = await getSessionFromRequest(req);
  if (!session) return jsonError("Unauthorized", 401);
  const ctx = await requireRole(roles, session);
  if (!ctx) return jsonError("Forbidden", 403);
  return ctx;
}

export function isErrorResponse(x: unknown): x is NextResponse {
  return x instanceof NextResponse;
}
