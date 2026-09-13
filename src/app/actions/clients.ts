"use server";

import { assertIds } from "@/lib/ids";

import { prisma } from "@/lib/db";
import { requireRole, type SessionPayload } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { track } from "@/lib/analytics";
import { z } from "zod";

const newClientSchema = z
  .object({
    name: z.string().trim().min(1, "Enter their name.").max(80),
    email: z.string().trim().toLowerCase().max(254).optional().or(z.literal("")),
    phone: z.string().trim().max(32).optional().or(z.literal("")),
  })
  .refine((v) => (v.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) || (v.phone && v.phone.replace(/\D/g, "").length >= 6), { message: "Add an email or a phone number so you can reach them." });

/**
 * The first client, before any channel has brought one in: the same Client record a
 * message would create, scoped to this workspace. An address already on file returns
 * that person rather than a second copy.
 */
export async function createClient(input: { name: string; email?: string; phone?: string }, actingSession?: SessionPayload | null): Promise<{ ok: true; id: string; existed: boolean } | { ok: false; error: string }> {
  const ctx = await requireRole(["OWNER", "ADMIN", "PHOTOGRAPHER"], actingSession);
  if (!ctx) return { ok: false, error: "unauthorized" };
  const parsed = newClientSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the details." };
  const { business, session } = ctx;
  const email = parsed.data.email || null;
  const phone = parsed.data.phone || null;
  const existing = email ? await prisma.client.findFirst({ where: { businessId: business.id, email }, select: { id: true } }) : null;
  if (existing) return { ok: true, id: existing.id, existed: true };
  const client = await prisma.client.create({ data: { businessId: business.id, name: parsed.data.name, email, phone } });
  await prisma.auditLog.create({ data: { businessId: business.id, actorId: session.userId, action: "client.created", targetType: "client", targetId: client.id } });
  await track("client_created", { businessId: business.id, properties: { via: "manual" } });
  if ((await prisma.client.count({ where: { businessId: business.id } })) === 1) await track("first_client_created", { businessId: business.id, properties: { via: "manual" } });
  revalidatePath("/dashboard/clients");
  revalidatePath("/dashboard");
  return { ok: true, id: client.id, existed: false };
}

export async function addClientNote(clientId: string, body: string, actingSession?: SessionPayload | null) {
  assertIds(clientId);
  const ctx = await requireRole(["OWNER", "ADMIN", "PHOTOGRAPHER"], actingSession);
  if (!ctx) throw new Error("unauthorized");
  const { business, session } = ctx;

  if (typeof body !== "string" || !body.trim() || body.length > 2000) throw new Error("A note is up to 2,000 characters.");
  const client = await prisma.client.findFirst({ where: { id: clientId, businessId: business.id } });
  if (!client) throw new Error("not found");

  await prisma.clientNote.create({ data: { clientId, body, authorId: session.userId } });
  revalidatePath(`/dashboard/clients/${clientId}`);
}

/** Merges another record into this person. Owner or admin only; both must be in this workspace. */
export async function mergeClients(keepId: string, mergeId: string, actingSession?: SessionPayload | null): Promise<{ ok: true } | { ok: false; error: string }> {
  assertIds(keepId, mergeId);
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
  assertIds(clientId, otherId);
  const ctx = await requireRole(["OWNER", "ADMIN"], actingSession);
  if (!ctx) return { ok: false, error: "unauthorized" };
  const rows = await prisma.client.findMany({ where: { businessId: ctx.business.id, id: { in: [clientId, otherId] } }, select: { id: true, notSameAs: true } });
  if (rows.length !== 2) return { ok: false, error: "One of these people isn't in this workspace." };
  await prisma.$transaction(rows.map((r) => prisma.client.update({ where: { id: r.id }, data: { notSameAs: { set: Array.from(new Set([...r.notSameAs, r.id === clientId ? otherId : clientId])) } } })));
  await track("merge_dismissed", { businessId: ctx.business.id });
  revalidatePath(`/dashboard/clients/${clientId}`);
  return { ok: true };
}
