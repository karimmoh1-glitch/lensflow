"use server";

import { prisma } from "@/lib/db";
import { requireRole, type SessionPayload } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { track } from "@/lib/analytics";

export async function addClientNote(clientId: string, body: string, actingSession?: SessionPayload | null) {
  const ctx = await requireRole(["OWNER", "ADMIN", "PHOTOGRAPHER"], actingSession);
  if (!ctx) throw new Error("unauthorized");
  const { business, session } = ctx;

  const client = await prisma.client.findFirst({ where: { id: clientId, businessId: business.id } });
  if (!client) throw new Error("not found");

  await prisma.clientNote.create({ data: { clientId, body, authorId: session.userId } });
  revalidatePath(`/dashboard/clients/${clientId}`);
}

/** Merges another record into this person. Owner or admin only; both must be in this workspace. */
export async function mergeClients(keepId: string, mergeId: string, actingSession?: SessionPayload | null): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await requireRole(["OWNER", "ADMIN"], actingSession);
  if (!ctx) return { ok: false, error: "unauthorized" };
  const { mergeClientRecords } = await import("@/server/identity");
  const candidates = await (await import("@/server/identity")).findMergeCandidates(ctx.business.id, keepId);
  const basis = candidates.find((c) => c.id === mergeId)?.basis ?? "manual";
  const result = await mergeClientRecords(ctx.business.id, keepId, mergeId);
  if (result.ok) {
    await track("clients_merged", { businessId: ctx.business.id, properties: { basis } });
    revalidatePath(`/dashboard/clients/${keepId}`);
    revalidatePath("/dashboard/clients");
    revalidatePath("/dashboard/inbox");
  }
  return result;
}

/** "Not the same person": remembered both ways so the suggestion doesn't come back. */
export async function dismissMerge(clientId: string, otherId: string, actingSession?: SessionPayload | null): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await requireRole(["OWNER", "ADMIN"], actingSession);
  if (!ctx) return { ok: false, error: "unauthorized" };
  const rows = await prisma.client.findMany({ where: { businessId: ctx.business.id, id: { in: [clientId, otherId] } }, select: { id: true, notSameAs: true } });
  if (rows.length !== 2) return { ok: false, error: "One of these people isn't in this workspace." };
  await prisma.$transaction(rows.map((r) => prisma.client.update({ where: { id: r.id }, data: { notSameAs: { set: Array.from(new Set([...r.notSameAs, r.id === clientId ? otherId : clientId])) } } })));
  await track("merge_dismissed", { businessId: ctx.business.id });
  revalidatePath(`/dashboard/clients/${clientId}`);
  return { ok: true };
}
