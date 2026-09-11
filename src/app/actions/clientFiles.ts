"use server";

import { revalidatePath } from "next/cache";
import { requireRole, type SessionPayload } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rateLimit";
import { ensureClientFolder, type FileProvider } from "@/server/clientFiles";
import { shareClientFolder, sendClientFolder, type ShareResult, type SendResult } from "@/server/clientDelivery";
import { recordAudit } from "@/server/audit";

const STAFF = ["OWNER", "ADMIN", "PHOTOGRAPHER"] as const;
const isProvider = (p: string): p is FileProvider => p === "GOOGLE_DRIVE" || p === "DROPBOX";

/** Make (or find) this client's folder in a connected file store. Staff only, tenant-scoped. */
export async function createClientFolder(clientId: string, provider: FileProvider, session?: SessionPayload | null): Promise<{ ok: true; url: string | null } | { ok: false; error: string }> {
  const ctx = await requireRole([...STAFF], session);
  if (!ctx) return { ok: false, error: "unauthorized" };
  if (!isProvider(provider)) return { ok: false, error: "Unknown file store." };
  const r = await ensureClientFolder(ctx.business.id, clientId.slice(0, 40), provider);
  if (!r.ok) return r;
  await recordAudit({ businessId: ctx.business.id, actorId: ctx.session.userId, action: "client.folder_created", targetType: "client", targetId: clientId, metadata: { provider } });
  revalidatePath(`/dashboard/clients/${clientId}`);
  return { ok: true, url: r.folder.url };
}

/** Give this client access to their folder, without sending anything yet. */
export async function shareClientFiles(clientId: string, provider: FileProvider, session?: SessionPayload | null): Promise<ShareResult> {
  const ctx = await requireRole([...STAFF], session);
  if (!ctx) return { ok: false, error: "unauthorized" };
  if (!isProvider(provider)) return { ok: false, error: "Unknown file store." };
  const r = await shareClientFolder(ctx.business.id, clientId.slice(0, 40), provider);
  revalidatePath(`/dashboard/clients/${clientId}`);
  return r;
}

/** Share the folder and send the client the link. Rate limited: this sends a real message. */
export async function sendClientFiles(clientId: string, provider: FileProvider, message?: string, bookingId?: string, session?: SessionPayload | null): Promise<SendResult> {
  const ctx = await requireRole([...STAFF], session);
  if (!ctx) return { ok: false, error: "unauthorized" };
  if (!isProvider(provider)) return { ok: false, error: "Unknown file store." };
  try {
    await enforceRateLimit(`client-files-send:${ctx.business.id}`, { limit: 30, windowMs: 60 * 60 * 1000 });
  } catch {
    return { ok: false, error: "That's a lot of deliveries in an hour. Try again shortly." };
  }
  const r = await sendClientFolder(ctx.business.id, clientId.slice(0, 40), provider, { message, bookingId: bookingId?.slice(0, 40) });
  revalidatePath(`/dashboard/clients/${clientId}`);
  return r;
}
