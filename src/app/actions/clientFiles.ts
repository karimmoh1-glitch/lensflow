"use server";

import { revalidatePath } from "next/cache";
import { requireRole, type SessionPayload } from "@/lib/auth";
import { ensureClientFolder, type FileProvider } from "@/server/clientFiles";
import { recordAudit } from "@/server/audit";

/** Make (or find) this client's folder in a connected file store. Staff only, tenant-scoped. */
export async function createClientFolder(clientId: string, provider: FileProvider, session?: SessionPayload | null): Promise<{ ok: true; url: string | null } | { ok: false; error: string }> {
  const ctx = await requireRole(["OWNER", "ADMIN", "PHOTOGRAPHER"], session);
  if (!ctx) return { ok: false, error: "unauthorized" };
  if (provider !== "GOOGLE_DRIVE" && provider !== "DROPBOX") return { ok: false, error: "Unknown file store." };
  const r = await ensureClientFolder(ctx.business.id, clientId.slice(0, 40), provider);
  if (!r.ok) return r;
  await recordAudit({ businessId: ctx.business.id, actorId: ctx.session.userId, action: "client.folder_created", targetType: "client", targetId: clientId, metadata: { provider } });
  revalidatePath(`/dashboard/clients/${clientId}`);
  return { ok: true, url: r.folder.url };
}
