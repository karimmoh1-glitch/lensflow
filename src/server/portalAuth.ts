import { prisma } from "@/lib/db";
import { requireBusiness, type SessionPayload } from "@/lib/auth";

/**
 * Resolves the Client CRM record for the signed-in CLIENT user, scoped to their active
 * organization. Every portal query must go through this — a client's userId only ever
 * maps to one Client row per org, so there's no id to spoof from the client side.
 *
 * Lives here, not in a "use server" module: every export of an actions file is a public
 * endpoint, and this one returned the whole business row (billing ids, payout details) to
 * whoever called it.
 */
export async function requireClientRecord(session?: SessionPayload | null) {
  const ctx = await requireBusiness(session);
  if (!ctx || ctx.role !== "CLIENT") return null;
  const client = await prisma.client.findFirst({ where: { userId: ctx.session.userId, businessId: ctx.business.id } });
  if (!client) return null;
  return { ...ctx, client };
}
