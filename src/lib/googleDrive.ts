import { getValidAccessToken } from "@/lib/google";
import { bearerJson, OAuthError } from "@/lib/integrations/oauth";
import type { Integration } from "@prisma/client";

/**
 * Google Drive with the drive.file scope: Daythread can only see folders and files it
 * created (or the person later opened with it), never the rest of the Drive. One
 * "Daythread" folder per connection, a folder per client inside it. References only.
 */
const API = "https://www.googleapis.com/drive/v3";
const FOLDER = "application/vnd.google-apps.folder";

export const driveToken = (integration: Integration) => getValidAccessToken(integration);

export type DriveFile = { id: string; name: string; mimeType: string; modifiedTime: string | null; webViewLink: string | null; size: number | null; isFolder: boolean };

const toFile = (f: { id: string; name: string; mimeType: string; modifiedTime?: string; webViewLink?: string; size?: string }): DriveFile => ({ id: f.id, name: f.name, mimeType: f.mimeType, modifiedTime: f.modifiedTime ?? null, webViewLink: f.webViewLink ?? null, size: f.size ? Number(f.size) : null, isFolder: f.mimeType === FOLDER });

export async function createDriveFolder(accessToken: string, name: string, parentId?: string | null): Promise<DriveFile> {
  const f = await bearerJson<{ id: string; name: string; mimeType: string; webViewLink?: string }>(`${API}/files?fields=id,name,mimeType,webViewLink`, accessToken, { method: "POST", body: { name, mimeType: FOLDER, ...(parentId ? { parents: [parentId] } : {}) } });
  return toFile(f);
}

/** The folder still exists and is not in the bin. */
export async function driveFolderAlive(accessToken: string, id: string): Promise<boolean> {
  try {
    const f = await bearerJson<{ id: string; trashed?: boolean }>(`${API}/files/${encodeURIComponent(id)}?fields=id,trashed`, accessToken);
    return !f.trashed;
  } catch (err) {
    if (err instanceof OAuthError && err.status === 404) return false;
    throw err;
  }
}

export async function listDriveFolder(accessToken: string, folderId: string): Promise<DriveFile[]> {
  const q = encodeURIComponent(`'${folderId.replace(/'/g, "\\'")}' in parents and trashed = false`);
  const r = await bearerJson<{ files: Array<{ id: string; name: string; mimeType: string; modifiedTime?: string; webViewLink?: string; size?: string }> }>(`${API}/files?q=${q}&fields=files(id,name,mimeType,modifiedTime,webViewLink,size)&orderBy=modifiedTime desc&pageSize=50`, accessToken);
  return (r.files ?? []).map(toFile);
}

export const driveFolderUrl = (id: string) => `https://drive.google.com/drive/folders/${id}`;

/**
 * Give one named person read access to one folder. Least privilege on purpose: a reader,
 * addressed by email, not "anyone with the link". Google emails them the link itself unless
 * asked not to; Daythread sends its own message, so the notification is suppressed here to
 * avoid two.
 *
 * Already-has-access is not a failure — Google answers 400 with a duplicate error and the
 * person can already open the folder, which is the outcome we wanted.
 */
export async function shareDriveFolderWithEmail(accessToken: string, folderId: string, email: string): Promise<{ shared: true } | { shared: false; reason: string }> {
  try {
    await bearerJson(`${API}/files/${encodeURIComponent(folderId)}/permissions?sendNotificationEmail=false`, accessToken, {
      method: "POST",
      body: { role: "reader", type: "user", emailAddress: email },
    });
    return { shared: true };
  } catch (err) {
    if (err instanceof OAuthError) {
      if (/duplicate/i.test(`${err.code ?? ""} ${err.message}`)) return { shared: true };
      if (err.status === 403) return { shared: false, reason: "Google refused to share this folder. The account may not be allowed to share outside its organisation." };
      if (err.status === 400 && /invalid.*email|invalidSharingRequest/i.test(`${err.code ?? ""} ${err.message}`)) return { shared: false, reason: "Google would not accept that email address." };
      return { shared: false, reason: "Google could not share the folder just now." };
    }
    throw err;
  }
}
