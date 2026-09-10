import { prisma } from "@/lib/db";

/**
 * One line in the workspace's audit log. Who did what to which record; never a token, a
 * message body or an address. Best effort: an audit write must never fail the action it
 * describes.
 */
export async function recordAudit(input: { businessId: string; actorId?: string | null; action: string; targetType?: string | null; targetId?: string | null; metadata?: Record<string, string | number | boolean | null> }): Promise<void> {
  try {
    await prisma.auditLog.create({ data: { businessId: input.businessId, actorId: input.actorId ?? null, action: input.action, targetType: input.targetType ?? null, targetId: input.targetId ?? null, metadata: input.metadata ?? undefined } });
  } catch {
    /* never block the action */
  }
}
