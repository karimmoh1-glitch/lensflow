import { prisma } from "@/lib/db";
import { providerMaturity } from "@/lib/integrations/flags";
import { recordAudit } from "@/server/audit";
import { notifyBusiness } from "@/server/notify";
import { track } from "@/lib/analytics";
import type { AccessRequestStatus, IntegrationProvider } from "@prisma/client";

/**
 * Invite-only integrations. A workspace asks; a founder decides; an approval is what lets
 * Connect appear. The gate is Daythread's own and sits in front of the provider's: an
 * approved workspace still completes the provider's real authorization, and the provider
 * still decides whether it delivers. Nothing here changes a provider's requirements.
 */
export type AccessView = { status: AccessRequestStatus | "NONE"; note: string | null; decisionNote: string | null; requestedAt: Date | null; reviewedAt: Date | null };

export async function accessRequestFor(businessId: string, provider: IntegrationProvider): Promise<AccessView> {
  const r = await prisma.integrationAccessRequest.findUnique({ where: { businessId_provider: { businessId, provider } } });
  return r ? { status: r.status, note: r.note, decisionNote: r.decisionNote, requestedAt: r.createdAt, reviewedAt: r.reviewedAt } : { status: "NONE", note: null, decisionNote: null, requestedAt: null, reviewedAt: null };
}

/** May this workspace start the provider's connect flow on this deployment? */
export async function accessGranted(businessId: string, provider: IntegrationProvider): Promise<boolean> {
  const stage = providerMaturity(provider);
  if (stage === "ga") return true;
  if (stage !== "beta") return false;
  const r = await prisma.integrationAccessRequest.findUnique({ where: { businessId_provider: { businessId, provider } }, select: { status: true } });
  return r?.status === "APPROVED";
}

export async function requestAccess(businessId: string, userId: string, provider: IntegrationProvider, note: string | null): Promise<{ ok: true; status: AccessRequestStatus } | { ok: false; error: string }> {
  if (providerMaturity(provider) !== "beta") return { ok: false, error: "This integration doesn't take access requests right now." };
  const existing = await prisma.integrationAccessRequest.findUnique({ where: { businessId_provider: { businessId, provider } } });
  if (existing?.status === "APPROVED") return { ok: true, status: "APPROVED" };
  if (existing?.status === "PENDING") return { ok: true, status: "PENDING" };
  const row = existing
    ? await prisma.integrationAccessRequest.update({ where: { id: existing.id }, data: { status: "PENDING", note, requestedById: userId, reviewedById: null, reviewedAt: null, decisionNote: null } })
    : await prisma.integrationAccessRequest.create({ data: { businessId, provider, note, requestedById: userId } });
  await recordAudit({ businessId, actorId: userId, action: "integration.access_requested", targetType: "access_request", targetId: row.id, metadata: { provider } });
  await track("integration_access_requested", { businessId, properties: { provider } });
  return { ok: true, status: "PENDING" };
}

export type AccessRequestRow = { id: string; provider: IntegrationProvider; status: AccessRequestStatus; note: string | null; decisionNote: string | null; createdAt: Date; reviewedAt: Date | null; business: { id: string; name: string; handle: string; planTier: string }; requester: string | null };

export async function listAccessRequests(opts: { status?: AccessRequestStatus; limit?: number } = {}): Promise<AccessRequestRow[]> {
  const rows = await prisma.integrationAccessRequest.findMany({ where: opts.status ? { status: opts.status } : {}, orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: opts.limit ?? 100, include: { business: { select: { id: true, name: true, handle: true, planTier: true } } } });
  const userIds = [...new Set(rows.map((r) => r.requestedById).filter((x): x is string => Boolean(x)))];
  const users = userIds.length ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, email: true } }) : [];
  const email = new Map(users.map((u) => [u.id, u.email]));
  return rows.map((r) => ({ id: r.id, provider: r.provider, status: r.status, note: r.note, decisionNote: r.decisionNote, createdAt: r.createdAt, reviewedAt: r.reviewedAt, business: r.business, requester: r.requestedById ? (email.get(r.requestedById) ?? null) : null }));
}

export async function decideAccess(id: string, decision: "APPROVED" | "REJECTED" | "REVOKED", reviewerId: string, decisionNote: string | null): Promise<{ ok: true } | { ok: false; error: string }> {
  const row = await prisma.integrationAccessRequest.findUnique({ where: { id } });
  if (!row) return { ok: false, error: "Request not found." };
  if (decision === "REVOKED" && row.status !== "APPROVED") return { ok: false, error: "Only an approved request can be revoked." };
  await prisma.integrationAccessRequest.update({ where: { id }, data: { status: decision, reviewedById: reviewerId, reviewedAt: new Date(), decisionNote } });
  await recordAudit({ businessId: row.businessId, actorId: reviewerId, action: `integration.access_${decision.toLowerCase()}`, targetType: "access_request", targetId: id, metadata: { provider: row.provider } });
  await track("integration_access_decided", { businessId: row.businessId, properties: { provider: row.provider, decision } });
  const name = row.provider === "INSTAGRAM" ? "Instagram" : row.provider;
  if (decision === "APPROVED") await notifyBusiness(row.businessId, { kind: "integration", title: `${name} access approved`, body: `You can connect ${name} from Settings now.`, target: { kind: "integrations" } });
  else if (decision === "REJECTED") await notifyBusiness(row.businessId, { kind: "integration", title: `${name} access not granted yet`, body: decisionNote ? decisionNote.slice(0, 200) : `Daythread couldn't open ${name} for this workspace yet.`, target: { kind: "integrations" } });
  else await notifyBusiness(row.businessId, { kind: "integration", title: `${name} access paused`, body: decisionNote ? decisionNote.slice(0, 200) : `Your ${name} access on Daythread was paused.`, target: { kind: "integrations" } });
  return { ok: true };
}
