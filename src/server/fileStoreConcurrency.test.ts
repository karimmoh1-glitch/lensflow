import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "@/lib/db";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }));

import { ensureClientFolder, type ExternalFolders } from "@/server/clientFiles";

/**
 * A client's folders live in one JSON column, and the folder itself lives in somebody's
 * real Google Drive or Dropbox. Both of those made the old read-modify-write dangerous:
 * two clicks created two folders and only the second was remembered, and setting up the
 * second provider erased the first one's entry. Google and Dropbox are stubbed at the
 * network edge here; nothing leaves the machine.
 */
const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const future = () => new Date(Date.now() + 3_600_000);

let driveFolders = 0;
let dropboxFolders = 0;

describe("file store folder creation", () => {
  const ids: string[] = [];
  let businessId: string;
  let clientId: string;

  beforeAll(async () => {
    const s = stamp();
    businessId = (await prisma.business.create({ data: { name: "Race Co", handle: `race-${s}` } })).id;
    ids.push(businessId);
    clientId = (await prisma.client.create({ data: { businessId, name: "Dana Client", email: "dana@example.test" } })).id;
    await prisma.integration.create({ data: { businessId, provider: "GOOGLE_DRIVE", status: "CONNECTED", accessToken: "g-at", refreshToken: "g-rt", tokenExpiresAt: future(), externalId: "owner@gmail.test" } });
    await prisma.integration.create({ data: { businessId, provider: "DROPBOX", status: "CONNECTED", accessToken: "d-at", refreshToken: "d-rt", tokenExpiresAt: future(), externalId: "dbid:owner" } });

    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      const u = String(url);
      // Google Drive: creating a folder, and checking whether one still exists.
      if (u.startsWith("https://www.googleapis.com/drive/v3/files") && (init?.method ?? "GET") === "POST") {
        driveFolders++;
        return json({ id: `drive-folder-${driveFolders}`, webViewLink: `https://drive.google.com/drive/folders/drive-folder-${driveFolders}` });
      }
      if (u.startsWith("https://www.googleapis.com/drive/v3/files")) return json({ id: "drive-folder-1", name: "Dana Client", trashed: false, mimeType: "application/vnd.google-apps.folder" });
      // Dropbox: create, then a shared link for it.
      if (u.includes("/files/create_folder_v2")) {
        dropboxFolders++;
        return json({ metadata: { id: `id:dropbox-${dropboxFolders}`, path_lower: "/clients/dana client", name: "Dana Client" } });
      }
      if (u.includes("/sharing/create_shared_link_with_settings")) return json({ url: "https://www.dropbox.com/scl/fo/abc" });
      if (u.includes("/sharing/list_shared_links")) return json({ links: [] });
      if (u.includes("/files/list_folder")) return json({ entries: [], has_more: false });
      if (u.includes("/files/get_metadata")) return json({ id: "id:dropbox-1", path_lower: "/clients/dana client", name: "Dana Client", ".tag": "folder" });
      return json({}, 404);
    });
  });
  afterAll(async () => {
    vi.unstubAllGlobals();
    await prisma.business.deleteMany({ where: { id: { in: ids } } });
  });

  const folders = async (): Promise<ExternalFolders> =>
    (((await prisma.client.findUniqueOrThrow({ where: { id: clientId }, select: { externalFolders: true } })).externalFolders ?? {}) as ExternalFolders) ?? {};

  it("two simultaneous requests agree on one folder instead of remembering the second", async () => {
    const [first, second] = await Promise.all([
      ensureClientFolder(businessId, clientId, "GOOGLE_DRIVE"),
      ensureClientFolder(businessId, clientId, "GOOGLE_DRIVE"),
    ]);
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    // Both callers are told about the same folder, and that is the one on the record.
    expect(first.folder.id).toBe(second.folder.id);
    expect((await folders()).GOOGLE_DRIVE?.id).toBe(first.folder.id);
  });

  it("setting up the second provider does not erase the first", async () => {
    const drive = (await folders()).GOOGLE_DRIVE;
    expect(drive?.id).toBeTruthy();

    const dropbox = await ensureClientFolder(businessId, clientId, "DROPBOX");
    expect(dropbox.ok).toBe(true);

    const after = await folders();
    expect(after.DROPBOX?.id).toBeTruthy();
    expect(after.GOOGLE_DRIVE?.id).toBe(drive?.id);
  });

  it("asking again returns the folder already on record without making another", async () => {
    const madeSoFar = driveFolders;
    const again = await ensureClientFolder(businessId, clientId, "GOOGLE_DRIVE");
    expect(again.ok).toBe(true);
    expect(driveFolders).toBe(madeSoFar);
  });

  it("a client from another workspace is refused, whatever the id looks like", async () => {
    const other = await prisma.business.create({ data: { name: "Elsewhere", handle: `elsewhere-${stamp()}` } });
    ids.push(other.id);
    const result = await ensureClientFolder(other.id, clientId, "GOOGLE_DRIVE");
    expect(result.ok).toBe(false);
  });
});
