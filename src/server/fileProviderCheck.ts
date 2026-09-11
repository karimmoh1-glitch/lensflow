import { prisma } from "@/lib/db";
import { driveToken, driveFolderAlive, listDriveFolder } from "@/lib/googleDrive";
import { dropboxToken, dropboxCurrentAccount, listDropboxFolder } from "@/lib/dropbox";
import { ensureDriveRoot, type FileProvider } from "@/server/clientFiles";
import { OAuthError } from "@/lib/integrations/oauth";
import { reportFailure } from "@/lib/observe";

/**
 * "Is this file connection actually working?" — answered by asking the provider, not by
 * reading a stored boolean. A token can be valid while the folder it points at has been
 * deleted, a scope can have been withdrawn, and an account can be reconnected as somebody
 * else; none of that shows up in the row.
 *
 * Read-only: it identifies the account and lists the folder Daythread made. It creates the
 * root folder if it is missing, because that is the same repair the delivery path would do
 * and a business should not have to guess why nothing works. Nothing here returns or stores
 * a token, and no file contents are read.
 */
export type FileProviderCheck = {
  checkedAt: string;
  provider: FileProvider;
  name: string;
  /** Every step had to succeed for this to be true. */
  ok: boolean;
  account: string | null;
  /** The folder client folders are created inside. */
  rootFolder: { known: boolean; reachable: boolean; url: string | null };
  clientFolders: number | null;
  /** What to do about it, in one sentence, or null when there is nothing to do. */
  problem: string | null;
};

const NAME = (p: FileProvider) => (p === "DROPBOX" ? "Dropbox" : "Google Drive");

export async function checkFileProvider(businessId: string, provider: FileProvider): Promise<{ ok: true; check: FileProviderCheck } | { ok: false; error: string }> {
  const row = await prisma.integration.findUnique({ where: { businessId_provider: { businessId, provider } } });
  if (!row || row.status === "NOT_CONNECTED" || row.status === "DEMO" || !row.accessToken) return { ok: false, error: `${NAME(provider)} isn't connected for this workspace.` };

  const check: FileProviderCheck = {
    checkedAt: new Date().toISOString(),
    provider,
    name: NAME(provider),
    ok: false,
    account: row.externalAccount,
    rootFolder: { known: false, reachable: false, url: null },
    clientFolders: null,
    problem: null,
  };

  try {
    if (provider === "DROPBOX") {
      const token = await dropboxToken(row);
      // Identifies the account. This is the call that used to fail outright because of the
      // content type, so it is the first thing worth proving still works.
      const account = await dropboxCurrentAccount(token);
      check.account = account.email;
      check.rootFolder = { known: true, reachable: true, url: null };
      // The app folder's root. An App-folder app can only ever see its own.
      const entries = await listDropboxFolder(token, "");
      check.clientFolders = entries.filter((e) => e.kind === "folder").length;
      check.ok = true;
    } else {
      const token = await driveToken(row);
      const settings = (row.settings ?? {}) as { rootFolderId?: string; clientsFolderId?: string };
      check.rootFolder.known = Boolean(settings.clientsFolderId);
      const alive = settings.clientsFolderId ? await driveFolderAlive(token, settings.clientsFolderId) : false;
      // A deleted folder is repaired rather than reported as a dead connection: the same
      // thing the delivery path would do on the next request.
      const clientsFolderId = alive ? settings.clientsFolderId! : await ensureDriveRoot(row);
      check.rootFolder = { known: true, reachable: true, url: `https://drive.google.com/drive/folders/${clientsFolderId}` };
      check.clientFolders = (await listDriveFolder(token, clientsFolderId)).filter((f) => f.isFolder).length;
      check.ok = true;
      if (!alive && settings.clientsFolderId) check.problem = "The Daythread folder had been removed from Drive, so it was created again. Existing client folders are not moved into it automatically.";
    }

    await prisma.integration.update({
      where: { id: row.id },
      data: { lastSyncedAt: new Date(), lastSyncStatus: "ok", lastError: null, lastErrorAt: null, status: row.status === "SYNC_ERROR" ? "CONNECTED" : row.status, settings: { ...((row.settings ?? {}) as object), lastCheck: check as unknown as object } },
    });
    return { ok: true, check };
  } catch (err) {
    const revoked = err instanceof OAuthError ? err.revoked : false;
    const scope = err instanceof OAuthError && /scope|insufficient|permission/i.test(`${err.code ?? ""} ${err.message}`);
    check.problem = revoked
      ? `${NAME(provider)} revoked access. Reconnect it from this page.`
      : scope
        ? `${NAME(provider)} refused a permission Daythread needs. Reconnect and approve everything it asks for.`
        : `${NAME(provider)} could not be reached just now. Nothing was changed.`;
    await prisma.integration.update({
      where: { id: row.id },
      data: { lastSyncStatus: "failed", lastError: check.problem, lastErrorAt: new Date(), status: revoked ? "NEEDS_ATTENTION" : row.status === "CONNECTED" ? "SYNC_ERROR" : row.status, settings: { ...((row.settings ?? {}) as object), lastCheck: check as unknown as object } },
    }).catch(() => {});
    await reportFailure("sync", `${provider} connection check failed`, { businessId, provider, error: err, level: "warn" });
    return { ok: true, check };
  }
}
