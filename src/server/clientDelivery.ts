import { prisma } from "@/lib/db";
import { ensureClientFolder, type FileProvider, type ExternalFolders, type FolderRef } from "@/server/clientFiles";
import { driveToken, shareDriveFolderWithEmail } from "@/lib/googleDrive";
import { deliverToCustomer } from "@/server/deliver";
import { recordAudit } from "@/server/audit";
import { reportFailure } from "@/lib/observe";
import { OAuthError } from "@/lib/integrations/oauth";

/**
 * Getting a client their files. The folder stays in the business's own Drive or Dropbox —
 * Daythread never copies the files — and what it adds is the part that is tedious by hand:
 * making sure the right person can open the folder, sending them the link on a channel they
 * already use, and remembering that it was sent.
 *
 * Sharing is least privilege. Google Drive grants one named person read access, addressed by
 * their email, never "anyone with the link". Dropbox's app-folder API has no per-person
 * grant, so it issues a link with the most restrictive visibility the account allows, and
 * the UI says so rather than implying the two are the same.
 */
export type ShareResult = { ok: true; url: string; sharedWith: string | null; note: string | null } | { ok: false; error: string };
export type SendResult =
  | { ok: true; url: string; sharedWith: string | null; notified: "sent" | "not_delivered"; via: string; note: string | null }
  | { ok: false; error: string };

const NAME = (p: FileProvider) => (p === "DROPBOX" ? "Dropbox" : "Google Drive");

/** How long a delivery to the same client on the same provider counts as the same send. */
const DUPLICATE_DELIVERY_MS = 30_000;

/**
 * What the Dropbox link actually is, in the words of the person sending it. Dropbox decides
 * this from the account's own sharing settings, so it is read back rather than assumed — a
 * personal account cannot restrict a folder link, and saying otherwise would be a lie about
 * who can see a customer's files.
 */
function dropboxLinkNote(visibility: string | undefined): string {
  switch (visibility) {
    case "team_only":
      return "Only people in your Dropbox team can open this link.";
    case "password":
    case "team_and_password":
      return "This link asks for the Dropbox password you set on it.";
    case "shared_folder_only":
      return "Only people already in this shared folder can open the link.";
    case "public":
      return "Anyone with this link can view the folder, so send it only to this client.";
    default:
      return "Dropbox did not say who can open this link. Check the folder's sharing settings in Dropbox before sending it.";
  }
}

async function saveFolder(clientId: string, folders: ExternalFolders, provider: FileProvider, patch: Partial<FolderRef>): Promise<FolderRef> {
  const next = { ...(folders[provider] as FolderRef), ...patch };
  await prisma.client.update({ where: { id: clientId }, data: { externalFolders: { ...folders, [provider]: next } } });
  return next;
}

/** Make the folder openable by this client, and hand back the link. */
export async function shareClientFolder(businessId: string, clientId: string, provider: FileProvider): Promise<ShareResult> {
  const made = await ensureClientFolder(businessId, clientId, provider);
  if (!made.ok) return { ok: false, error: made.error };
  const client = await prisma.client.findFirst({ where: { id: clientId, businessId }, select: { id: true, email: true, externalFolders: true } });
  if (!client) return { ok: false, error: "Client not found." };
  const folders = (client.externalFolders ?? {}) as ExternalFolders;
  const folder = made.folder;

  if (provider === "DROPBOX") {
    if (!folder.url) return { ok: false, error: "Dropbox did not return a link for this folder. Open it in Dropbox once, then try again." };
    await saveFolder(client.id, folders, provider, { sharedAt: new Date().toISOString(), sharedWith: null });
    return { ok: true, url: folder.url, sharedWith: null, note: dropboxLinkNote(folder.visibility) };
  }

  if (!folder.id) return { ok: false, error: "The Drive folder is missing. Create it again from this page." };
  if (!client.email) {
    // Nothing is shared silently: without an address there is nobody to grant access to.
    return { ok: false, error: "Add an email address for this client first — Drive shares the folder with a named person, not with anyone holding the link." };
  }
  const row = await prisma.integration.findUnique({ where: { businessId_provider: { businessId, provider: "GOOGLE_DRIVE" } } });
  if (!row || row.status === "NOT_CONNECTED" || !row.accessToken) return { ok: false, error: "Google Drive isn't connected." };
  try {
    const shared = await shareDriveFolderWithEmail(await driveToken(row), folder.id, client.email);
    if (!shared.shared) return { ok: false, error: shared.reason };
    const saved = await saveFolder(client.id, folders, provider, { sharedAt: new Date().toISOString(), sharedWith: client.email });
    await recordAudit({ businessId, action: "client.folder_shared", targetType: "client", targetId: client.id, metadata: { provider } });
    return { ok: true, url: saved.url ?? folder.url ?? "", sharedWith: client.email, note: null };
  } catch (err) {
    const revoked = err instanceof OAuthError ? err.revoked : false;
    await reportFailure("sync", "Drive folder share failed", { businessId, provider: "GOOGLE_DRIVE", error: err });
    return { ok: false, error: revoked ? "Google revoked access — reconnect Google Drive from Settings." : "Couldn't share the folder just now. Nothing was changed." };
  }
}

/**
 * Share the folder and send the client the link on a channel they already use, then record
 * that it went. When a booking is named, that booking's delivery is marked too, so the
 * booking and the client tell the same story.
 */
export async function sendClientFolder(businessId: string, clientId: string, provider: FileProvider, opts: { message?: string; bookingId?: string } = {}): Promise<SendResult> {
  const shared = await shareClientFolder(businessId, clientId, provider);
  if (!shared.ok) return shared;
  const [business, client] = await Promise.all([
    prisma.business.findUniqueOrThrow({ where: { id: businessId }, select: { name: true, handle: true } }),
    prisma.client.findFirstOrThrow({ where: { id: clientId, businessId }, select: { id: true, name: true, email: true, phone: true, externalFolders: true } }),
  ]);
  const channel = client.email ? "EMAIL" : client.phone ? "SMS" : null;
  const to = client.email ?? client.phone ?? null;
  if (!channel || !to) return { ok: false, error: "This client has no email address or phone number to send the link to." };

  // Two clicks on "Send files" used to send the client two emails and record two
  // deliveries. The record of the last delivery is the guard, so it survives a refresh and
  // a second tab, and the second caller is told the truth rather than sending again.
  const already = (client.externalFolders as ExternalFolders | null)?.[provider];
  if (already?.deliveredAt && Date.now() - new Date(already.deliveredAt).getTime() < DUPLICATE_DELIVERY_MS) {
    return { ok: true, url: shared.url, sharedWith: shared.sharedWith, notified: "sent", via: already.deliveredVia ?? "none", note: "Already sent a moment ago." };
  }

  const note = (opts.message ?? "").trim().slice(0, 500);
  const body = [note || `Your files from ${business.name} are ready.`, "", shared.url].join("\n");
  const delivery = await deliverToCustomer({ businessId, businessName: business.name, businessHandle: business.handle, channel, to, body, subject: `Your files from ${business.name}` });

  const folders = (client.externalFolders ?? {}) as ExternalFolders;
  const when = new Date();
  if (delivery.status === "SENT") {
    await saveFolder(client.id, folders, provider, { deliveredAt: when.toISOString(), deliveredVia: channel });
    if (opts.bookingId) {
      // Tenant-scoped: a booking id from the browser can only touch this workspace's booking.
      await prisma.booking.updateMany({ where: { id: opts.bookingId, businessId, clientId: client.id }, data: { deliveryUrl: shared.url, deliveredAt: when, ...(note ? { deliveryNote: note } : {}) } });
    }
    await recordAudit({ businessId, action: "client.files_delivered", targetType: "client", targetId: client.id, metadata: { provider, via: channel } });
  }
  return {
    ok: true,
    url: shared.url,
    sharedWith: shared.sharedWith,
    notified: delivery.status === "SENT" ? "sent" : "not_delivered",
    via: channel,
    note: delivery.status === "SENT" ? shared.note : delivery.error ?? "The link couldn't be sent. Copy it and send it yourself.",
  };
}
