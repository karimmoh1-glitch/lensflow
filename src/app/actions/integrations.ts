"use server";

import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import type { IntegrationProvider } from "@prisma/client";

/** Returns `{ error }` for the plan-limit case rather than throwing — see toggleAutomation
 * for why (a thrown action error is a 500 whose message production strips). */
export async function toggleIntegration(provider: IntegrationProvider, connect: boolean): Promise<{ error?: string }> {
  const ctx = await requireRole(["OWNER", "ADMIN"]);
  if (!ctx) throw new Error("unauthorized");
  const { business } = ctx;

  // There is no such thing as a toggled-on integration any more: a connection is only ever
  // made by the provider's own sign-in (Settings → Channels), which is where the plan's
  // allowance is enforced. This action can only clear a legacy demo row.
  if (connect) {
    return { error: "Connections are made from Settings → Channels with the provider's own sign-in." };
  }
  await prisma.integration.updateMany({ where: { businessId: business.id, provider, status: "DEMO" }, data: { status: "NOT_CONNECTED", lastSyncedAt: null } });
  revalidatePath("/dashboard/settings");
  return {};
}
