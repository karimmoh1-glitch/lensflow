import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { prisma } from "@/lib/db";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }));

import { checkFileProvider } from "@/server/fileProviderCheck";

/**
 * The check has to be able to say "no". A stored "connected" cannot know that the folder
 * was deleted or a permission withdrawn, and a business finds both out at the worst moment.
 */
const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const future = () => new Date(Date.now() + 3600_000);

let responder: (url: string, init?: RequestInit) => Response = () => json({});
const calls: string[] = [];

describe("file connection check", () => {
  const ids: string[] = [];
  let biz: string;

  beforeAll(async () => {
    biz = (await prisma.business.create({ data: { name: "Files Co", handle: `files-${stamp()}` } })).id;
    ids.push(biz);
    await prisma.integration.create({ data: { businessId: biz, provider: "GOOGLE_DRIVE", status: "CONNECTED", accessToken: "g-at", refreshToken: "g-rt", tokenExpiresAt: future(), externalId: "owner@gmail.test", externalAccount: "owner@gmail.test", settings: { rootFolderId: "f-root", clientsFolderId: "f-clients" } } });
    await prisma.integration.create({ data: { businessId: biz, provider: "DROPBOX", status: "CONNECTED", accessToken: "d-at", refreshToken: "d-rt", tokenExpiresAt: future(), externalId: "dbid:1", externalAccount: "owner@dropbox.test" } });
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => { calls.push(String(url)); return responder(String(url), init); });
  });
  afterEach(() => { calls.length = 0; responder = () => json({}); });
  afterAll(async () => { await prisma.business.deleteMany({ where: { id: { in: ids } } }); vi.unstubAllGlobals(); });

  it("Drive: a working connection reports the account, the folder and what is in it", async () => {
    responder = (url) => {
      if (/\/files\/[^?]+\?fields=id,trashed/.test(url)) return json({ id: "f-clients", trashed: false });
      if (url.includes("/files?q=")) return json({ files: [{ id: "c1", name: "Sarah", mimeType: "application/vnd.google-apps.folder" }, { id: "c2", name: "Mike", mimeType: "application/vnd.google-apps.folder" }] });
      return json({});
    };
    const r = await checkFileProvider(biz, "GOOGLE_DRIVE");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.check).toMatchObject({ ok: true, clientFolders: 2, problem: null });
    expect(r.check.rootFolder.reachable).toBe(true);
    // Recorded on the row so the panel can show the last answer without asking again.
    const row = await prisma.integration.findUniqueOrThrow({ where: { businessId_provider: { businessId: biz, provider: "GOOGLE_DRIVE" } } });
    expect((row.settings as { lastCheck?: { ok: boolean } }).lastCheck?.ok).toBe(true);
    expect(JSON.stringify(row.settings)).not.toContain("g-at");
  });

  it("Drive: a deleted Daythread folder is rebuilt and the business is told, rather than silently failing later", async () => {
    responder = (url, init) => {
      if (/\/files\/[^?]+\?fields=id,trashed/.test(url)) return json({ id: "f-clients", trashed: true });
      if (url.includes("/files?") && init?.method === "POST") return json({ id: "f-new", name: "Clients", mimeType: "application/vnd.google-apps.folder" });
      if (url.includes("/files?q=")) return json({ files: [] });
      return json({});
    };
    const r = await checkFileProvider(biz, "GOOGLE_DRIVE");
    if (!r.ok) throw new Error("expected a check");
    expect(r.check.ok).toBe(true);
    expect(r.check.problem).toMatch(/created again/i);
  });

  it("Drive: revoked access says reconnect, and flips the row to needs attention", async () => {
    responder = () => json({ error: { code: 401, message: "Invalid Credentials" } }, 401);
    const r = await checkFileProvider(biz, "GOOGLE_DRIVE");
    if (!r.ok) throw new Error("expected a check");
    expect(r.check.ok).toBe(false);
    expect(r.check.problem).toMatch(/revoked/i);
    const row = await prisma.integration.findUniqueOrThrow({ where: { businessId_provider: { businessId: biz, provider: "GOOGLE_DRIVE" } } });
    expect(row.status).toBe("NEEDS_ATTENTION");
    await prisma.integration.update({ where: { id: row.id }, data: { status: "CONNECTED", settings: { rootFolderId: "f-root", clientsFolderId: "f-clients" } } });
  });

  it("Dropbox: identifies the account and counts the folders, proving the call that used to fail", async () => {
    responder = (url, init) => {
      if (url.includes("users/get_current_account")) {
        // The defect this guards: a JSON content type here is rejected by Dropbox.
        const headers = Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]));
        if (headers["content-type"]) return json({ error_summary: "Bad HTTP Content-Type header" }, 400);
        return json({ account_id: "dbid:1", email: "owner@dropbox.test", name: { display_name: "Owner" } });
      }
      if (url.includes("files/list_folder")) return json({ entries: [{ ".tag": "folder", id: "id:1", name: "Clients", path_display: "/Clients" }] });
      return json({});
    };
    const r = await checkFileProvider(biz, "DROPBOX");
    if (!r.ok) throw new Error("expected a check");
    expect(r.check).toMatchObject({ ok: true, account: "owner@dropbox.test", clientFolders: 1, problem: null });
  });

  it("refuses a workspace that has not connected the provider, and a legacy DEMO row", async () => {
    const other = (await prisma.business.create({ data: { name: "No Files", handle: `nofiles-${stamp()}` } })).id;
    ids.push(other);
    expect(await checkFileProvider(other, "DROPBOX")).toMatchObject({ ok: false });
    await prisma.integration.create({ data: { businessId: other, provider: "GOOGLE_DRIVE", status: "DEMO" } });
    expect(await checkFileProvider(other, "GOOGLE_DRIVE")).toMatchObject({ ok: false });
  });
});
