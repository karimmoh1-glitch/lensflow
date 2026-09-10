import { prisma } from "@/lib/db";
import { driveToken, createDriveFolder, driveFolderAlive, listDriveFolder, driveFolderUrl, type DriveFile } from "@/lib/googleDrive";
import { dropboxToken, ensureDropboxFolder, listDropboxFolder, dropboxFolderLink, type DropboxEntry } from "@/lib/dropbox";
import { reportFailure } from "@/lib/observe";
import { OAuthError } from "@/lib/integrations/oauth";
import type { Integration } from "@prisma/client";

/**
 * A folder per client in the file store the business connected. Daythread creates the
 * folder on request and remembers where it is; the files themselves stay in Drive or
 * Dropbox and are only listed (names, dates, links). Never uploaded, never copied.
 */
export type FileProvider = "GOOGLE_DRIVE" | "DROPBOX";
export type FolderRef = { id?: string; path?: string; url: string | null; createdAt: string };
export type ExternalFolders = Partial<Record<FileProvider, FolderRef>>;
export type ClientFile = { id: string; name: string; url: string | null; modifiedAt: string | null; size: number | null; isFolder: boolean };

const ROOT_NAME = "Daythread";
const CLIENTS = "Clients";

const safeName = (name: string) => name.replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "Client";

async function markFailure(row: Integration, err: unknown) {
  const revoked = err instanceof OAuthError ? err.revoked : /invalid_grant|401/i.test(err instanceof Error ? err.message : "");
  await prisma.integration.update({ where: { id: row.id }, data: { lastSyncStatus: "failed", lastError: revoked ? "Access was revoked — reconnect" : `Couldn't reach ${row.provider === "DROPBOX" ? "Dropbox" : "Google Drive"} just now.`, lastErrorAt: new Date(), status: revoked ? "NEEDS_ATTENTION" : "SYNC_ERROR" } });
  await reportFailure("sync", `${row.provider} request failed`, { businessId: row.businessId, provider: row.provider, error: err });
}

async function markOk(row: Integration) {
  await prisma.integration.update({ where: { id: row.id }, data: { lastSyncStatus: "ok", lastSyncedAt: new Date(), lastError: null, lastErrorAt: null, status: row.status === "SYNC_ERROR" ? "CONNECTED" : row.status } });
}

/** The connection's own root folder in Drive ("Daythread"), created once and re-created if the person removed it. */
export async function ensureDriveRoot(row: Integration): Promise<string> {
  const settings = (row.settings ?? {}) as { rootFolderId?: string; clientsFolderId?: string };
  const token = await driveToken(row);
  let rootId = settings.rootFolderId && (await driveFolderAlive(token, settings.rootFolderId)) ? settings.rootFolderId : null;
  if (!rootId) rootId = (await createDriveFolder(token, ROOT_NAME)).id;
  let clientsId = settings.clientsFolderId && rootId === settings.rootFolderId && (await driveFolderAlive(token, settings.clientsFolderId)) ? settings.clientsFolderId : null;
  if (!clientsId) clientsId = (await createDriveFolder(token, CLIENTS, rootId)).id;
  if (rootId !== settings.rootFolderId || clientsId !== settings.clientsFolderId) await prisma.integration.update({ where: { id: row.id }, data: { settings: { ...settings, rootFolderId: rootId, clientsFolderId: clientsId } } });
  return clientsId;
}

export async function ensureClientFolder(businessId: string, clientId: string, provider: FileProvider): Promise<{ ok: true; folder: FolderRef } | { ok: false; error: string }> {
  const [client, row] = await Promise.all([
    prisma.client.findFirst({ where: { id: clientId, businessId } }),
    prisma.integration.findUnique({ where: { businessId_provider: { businessId, provider } } }),
  ]);
  if (!client) return { ok: false, error: "Client not found." };
  if (!row || row.status === "NOT_CONNECTED" || !row.accessToken) return { ok: false, error: `${provider === "DROPBOX" ? "Dropbox" : "Google Drive"} isn't connected.` };
  const folders = (client.externalFolders ?? {}) as ExternalFolders;
  try {
    let folder: FolderRef;
    if (provider === "GOOGLE_DRIVE") {
      const token = await driveToken(row);
      if (folders.GOOGLE_DRIVE?.id && (await driveFolderAlive(token, folders.GOOGLE_DRIVE.id))) { await markOk(row); return { ok: true, folder: folders.GOOGLE_DRIVE }; }
      const parent = await ensureDriveRoot(row);
      const f = await createDriveFolder(token, safeName(client.name), parent);
      folder = { id: f.id, url: f.webViewLink ?? driveFolderUrl(f.id), createdAt: new Date().toISOString() };
    } else {
      const token = await dropboxToken(row);
      const path = folders.DROPBOX?.path ?? `/${CLIENTS}/${safeName(client.name)}`;
      const f = await ensureDropboxFolder(token, path);
      const url = folders.DROPBOX?.url ?? (await dropboxFolderLink(token, f.path));
      folder = { id: f.id, path: f.path, url, createdAt: folders.DROPBOX?.createdAt ?? new Date().toISOString() };
    }
    await prisma.client.update({ where: { id: client.id }, data: { externalFolders: { ...folders, [provider]: folder } } });
    await markOk(row);
    return { ok: true, folder };
  } catch (err) {
    await markFailure(row, err);
    return { ok: false, error: err instanceof OAuthError && err.revoked ? "Access was revoked — reconnect from Settings." : "Couldn't reach the file store just now. Nothing was changed." };
  }
}

export type ClientFilesView = { provider: FileProvider; name: string; connected: boolean; folder: FolderRef | null; files: ClientFile[]; error: string | null };

/** What the client page shows: for each connected store, the folder (if made) and its files. */
export async function clientFiles(businessId: string, clientId: string): Promise<ClientFilesView[]> {
  const [client, rows] = await Promise.all([
    prisma.client.findFirst({ where: { id: clientId, businessId }, select: { externalFolders: true } }),
    prisma.integration.findMany({ where: { businessId, provider: { in: ["GOOGLE_DRIVE", "DROPBOX"] }, status: { not: "NOT_CONNECTED" } } }),
  ]);
  const folders = ((client?.externalFolders ?? {}) as ExternalFolders) ?? {};
  const out: ClientFilesView[] = [];
  for (const row of rows) {
    const provider = row.provider as FileProvider;
    const name = provider === "DROPBOX" ? "Dropbox" : "Google Drive";
    const folder = folders[provider] ?? null;
    const view: ClientFilesView = { provider, name, connected: true, folder, files: [], error: null };
    if (folder && row.accessToken) {
      try {
        if (provider === "GOOGLE_DRIVE" && folder.id) view.files = (await listDriveFolder(await driveToken(row), folder.id)).map(fromDrive);
        else if (provider === "DROPBOX" && folder.path) view.files = (await listDropboxFolder(await dropboxToken(row), folder.path)).map(fromDropbox);
        await markOk(row);
      } catch (err) {
        await markFailure(row, err);
        view.error = err instanceof OAuthError && err.status === 404 ? "The folder was moved or deleted." : `Couldn't list ${name} right now.`;
      }
    }
    out.push(view);
  }
  return out;
}

const fromDrive = (f: DriveFile): ClientFile => ({ id: f.id, name: f.name, url: f.webViewLink, modifiedAt: f.modifiedTime, size: f.size, isFolder: f.isFolder });
const fromDropbox = (e: DropboxEntry): ClientFile => ({ id: e.id, name: e.name, url: null, modifiedAt: e.modifiedAt, size: e.size, isFolder: e.kind === "folder" });
