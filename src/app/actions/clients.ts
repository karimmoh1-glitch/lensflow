"use server";

import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export async function addClientNote(clientId: string, body: string) {
  const ctx = await requireRole(["OWNER", "ADMIN", "PHOTOGRAPHER"]);
  if (!ctx) throw new Error("unauthorized");
  const { business, session } = ctx;

  const client = await prisma.client.findFirst({ where: { id: clientId, businessId: business.id } });
  if (!client) throw new Error("not found");

  await prisma.clientNote.create({ data: { clientId, body, authorId: session.userId } });
  revalidatePath(`/dashboard/clients/${clientId}`);
}
