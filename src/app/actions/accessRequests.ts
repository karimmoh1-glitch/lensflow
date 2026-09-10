"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession, requireRole, type SessionPayload } from "@/lib/auth";
import { isFounder } from "@/lib/founder";
import { enforceRateLimit, getClientIp } from "@/lib/rateLimit";
import { requestAccess, decideAccess } from "@/server/accessRequests";
import type { IntegrationProvider } from "@prisma/client";

const ProviderSchema = z.enum(["INSTAGRAM"]);

/** A workspace asks to use an invite-only integration. Owners and admins; a few per hour. */
export async function requestIntegrationAccess(provider: IntegrationProvider, note?: string, session?: SessionPayload | null): Promise<{ ok: true; status: string } | { ok: false; error: string }> {
  const ctx = await requireRole(["OWNER", "ADMIN"], session);
  if (!ctx) return { ok: false, error: "unauthorized" };
  const p = ProviderSchema.safeParse(provider);
  if (!p.success) return { ok: false, error: "This integration doesn't take access requests." };
  try { await enforceRateLimit(`access-request:${ctx.business.id}:${await getClientIp()}`, { limit: 5, windowMs: 60 * 60 * 1000 }); } catch { return { ok: false, error: "Too many requests. Try again in an hour." }; }
  const cleaned = (note ?? "").trim().slice(0, 500) || null;
  const r = await requestAccess(ctx.business.id, ctx.session.userId, p.data, cleaned);
  revalidatePath("/dashboard/settings");
  return r;
}

/** A founder decides. Anyone else — or a deployment without FOUNDER_EMAILS — is refused, not hinted. */
export async function decideIntegrationAccess(id: string, decision: "APPROVED" | "REJECTED" | "REVOKED", note?: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthorized" };
  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { email: true } });
  if (!isFounder(user?.email)) return { ok: false, error: "unauthorized" };
  if (!["APPROVED", "REJECTED", "REVOKED"].includes(decision)) return { ok: false, error: "Unknown decision." };
  const r = await decideAccess(id.slice(0, 40), decision, session.userId, (note ?? "").trim().slice(0, 300) || null);
  revalidatePath("/admin/growth");
  return r;
}
