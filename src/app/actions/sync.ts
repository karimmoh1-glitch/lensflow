"use server";

import { revalidatePath } from "next/cache";
import { requireRole, type SessionPayload } from "@/lib/auth";
import { reconcileBusiness, type ReconcileResult } from "@/server/reconcile";

/** The "Check for messages" button: reconcile every connected channel. Tenant-scoped; throttled per connection. */
export async function reconcileChannels(session?: SessionPayload | null): Promise<{ ok: boolean; results: ReconcileResult[]; ingested: number; error?: string }> {
  const ctx = await requireRole(["OWNER", "ADMIN", "PHOTOGRAPHER"], session);
  if (!ctx) return { ok: false, results: [], ingested: 0, error: "unauthorized" };
  const r = await reconcileBusiness(ctx.business.id);
  if (r.ingested > 0) { revalidatePath("/dashboard/inbox"); revalidatePath("/dashboard"); }
  return { ok: true, ...r };
}
