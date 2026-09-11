import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { prisma } from "@/lib/db";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }));

import { shareClientFolder, sendClientFolder } from "@/server/clientDelivery";
import { ensureClientFolder, clientFiles, type ExternalFolders } from "@/server/clientFiles";

/**
 * Getting a client their files, end to end: folder, access, link, and a record that it was
 * sent. Google and Dropbox are stubbed at the network edge by URL; nothing leaves the machine.
 */
const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const future = () => new Date(Date.now() + 3600_000);

type Call = { url: string; method: string; body: unknown };
const calls: Call[] = [];
let driveShareStatus = 200;
let driveShareBody: unknown = { id: "perm1" };
let gmailSends = 0;

describe("client file delivery", () => {
  const ids: string[] = [];
  let biz: string;
  let clientId: string;
  let noEmailId: string;
  let otherBiz = "";
  let otherClient = "";

  beforeAll(async () => {
    biz = (await prisma.business.create({ data: { name: "Deliver Co", handle: `deliver-${stamp()}` } })).id;
    ids.push(biz);
    clientId = (await prisma.client.create({ data: { businessId: biz, name: "Sarah Johnson", email: "sarah@example.test" } })).id;
    noEmailId = (await prisma.client.create({ data: { businessId: biz, name: "No Contact" } })).id;
    await prisma.integration.create({ data: { businessId: biz, provider: "GOOGLE_DRIVE", status: "CONNECTED", accessToken: "g-at", refreshToken: "g-rt", tokenExpiresAt: future(), externalId: "owner@gmail.test", externalAccount: "owner@gmail.test" } });
    await prisma.integration.create({ data: { businessId: biz, provider: "EMAIL", status: "CONNECTED", accessToken: "gm-at", refreshToken: "gm-rt", tokenExpiresAt: future(), externalId: "owner@gmail.test", externalAccount: "owner@gmail.test" } });
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      const u = String(url);
      const method = init?.method ?? "GET";
      let body: unknown = null;
      if (typeof init?.body === "string") { try { body = JSON.parse(init.body); } catch { body = init.body; } }
      calls.push({ url: u, method, body });
      if (u.includes("/permissions")) return json(driveShareBody, driveShareStatus);
      if (u.includes("/drive/v3/files?") && method === "POST") { const name = (body as { name: string }).name; return json({ id: `f-${name.replace(/\W+/g, "_")}`, name, mimeType: "application/vnd.google-apps.folder", webViewLink: `https://drive.google.com/drive/folders/f-${name.replace(/\W+/g, "_")}` }); }
      if (/\/drive\/v3\/files\/[^?]+\?fields=id,trashed/.test(u)) return json({ id: "x", trashed: false });
      if (u.includes("/drive/v3/files?q=")) return json({ files: [] });
      if (u.includes("/messages/send")) { gmailSends++; return json({ id: `gm_${stamp()}` }); }
      return json({});
    });
  });
  afterEach(() => { calls.length = 0; driveShareStatus = 200; driveShareBody = { id: "perm1" }; gmailSends = 0; });
  afterAll(async () => { await prisma.business.deleteMany({ where: { id: { in: ids } } }); vi.unstubAllGlobals(); });

  it("shares the folder with the client by name, never with anyone holding the link", async () => {
    const r = await shareClientFolder(biz, clientId, "GOOGLE_DRIVE");
    expect(r).toMatchObject({ ok: true, sharedWith: "sarah@example.test" });
    const perm = calls.find((c) => c.url.includes("/permissions"));
    expect(perm?.body).toMatchObject({ role: "reader", type: "user", emailAddress: "sarah@example.test" });
    // Least privilege: no "anyone with the link" grant is ever requested.
    expect(JSON.stringify(calls)).not.toContain('"type":"anyone"');
    // Google's own notification is suppressed so the client gets one message, not two.
    expect(perm?.url).toContain("sendNotificationEmail=false");
    const stored = (await prisma.client.findUniqueOrThrow({ where: { id: clientId } })).externalFolders as ExternalFolders;
    expect(stored.GOOGLE_DRIVE?.sharedWith).toBe("sarah@example.test");
  });

  it("refuses to share a Drive folder when there is nobody to share it with", async () => {
    const r = await shareClientFolder(biz, noEmailId, "GOOGLE_DRIVE");
    expect(r).toMatchObject({ ok: false });
    if (r.ok) return;
    expect(r.error).toMatch(/email address/i);
    expect(calls.some((c) => c.url.includes("/permissions"))).toBe(false);
  });

  it("sends the link, records that it went, and marks the booking's delivery", async () => {
    const service = await prisma.service.create({ data: { businessId: biz, name: "Wedding", priceCents: 100_000 } });
    const booking = await prisma.booking.create({ data: { businessId: biz, clientId, serviceId: service.id, startAt: new Date(), endAt: new Date(Date.now() + 3600_000), status: "COMPLETED", totalCents: 100_000 } });
    const r = await sendClientFolder(biz, clientId, "GOOGLE_DRIVE", { message: "Your gallery is ready.", bookingId: booking.id });
    expect(r).toMatchObject({ ok: true, notified: "sent", via: "EMAIL" });
    expect(gmailSends).toBe(1);
    const stored = (await prisma.client.findUniqueOrThrow({ where: { id: clientId } })).externalFolders as ExternalFolders;
    expect(stored.GOOGLE_DRIVE?.deliveredAt).toBeTruthy();
    expect(stored.GOOGLE_DRIVE?.deliveredVia).toBe("EMAIL");
    const after = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(after.deliveredAt).toBeTruthy();
    expect(after.deliveryUrl).toContain("drive.google.com");
    expect(after.deliveryNote).toBe("Your gallery is ready.");
  });

  it("a booking from another workspace cannot be marked delivered through this one", async () => {
    const other = (await prisma.business.create({ data: { name: "Other Co", handle: `other-${stamp()}` } })).id;
    ids.push(other);
    otherBiz = other;
    const oc = await prisma.client.create({ data: { businessId: other, name: "Theirs", email: "theirs@example.test" } });
    otherClient = oc.id;
    const os = await prisma.service.create({ data: { businessId: other, name: "Shoot", priceCents: 1 } });
    const ob = await prisma.booking.create({ data: { businessId: other, clientId: oc.id, serviceId: os.id, startAt: new Date(), endAt: new Date(Date.now() + 3600_000), status: "COMPLETED", totalCents: 1 } });
    const r = await sendClientFolder(biz, clientId, "GOOGLE_DRIVE", { bookingId: ob.id });
    expect(r.ok).toBe(true);
    const untouched = await prisma.booking.findUniqueOrThrow({ where: { id: ob.id } });
    expect(untouched.deliveredAt).toBeNull();
    expect(untouched.deliveryUrl).toBeNull();
  });

  it("a client in another workspace is not reachable from this one", async () => {
    expect(otherBiz && otherClient).toBeTruthy();
    expect(await shareClientFolder(biz, otherClient, "GOOGLE_DRIVE")).toMatchObject({ ok: false });
    expect(await sendClientFolder(biz, otherClient, "GOOGLE_DRIVE", {})).toMatchObject({ ok: false });
  });

  it("when Google refuses the share, nothing claims to have been shared or sent", async () => {
    driveShareStatus = 403;
    driveShareBody = { error: { code: 403, message: "The user does not have sufficient permissions" } };
    const before = (await prisma.client.findUniqueOrThrow({ where: { id: clientId } })).externalFolders as ExternalFolders;
    const r = await shareClientFolder(biz, clientId, "GOOGLE_DRIVE");
    expect(r.ok).toBe(false);
    const after = (await prisma.client.findUniqueOrThrow({ where: { id: clientId } })).externalFolders as ExternalFolders;
    expect(after.GOOGLE_DRIVE?.sharedAt).toBe(before.GOOGLE_DRIVE?.sharedAt);
    expect(gmailSends).toBe(0);
  });

  it("an existing grant is success, not an error, and the folder is not recreated", async () => {
    driveShareStatus = 400;
    driveShareBody = { error: { code: 400, message: "duplicate: permission already exists" } };
    const r = await shareClientFolder(biz, clientId, "GOOGLE_DRIVE");
    expect(r).toMatchObject({ ok: true, sharedWith: "sarah@example.test" });
    const created = calls.filter((c) => c.url.includes("/drive/v3/files?") && c.method === "POST");
    expect(created).toHaveLength(0);
  });

  it("the folder is made once and reused", async () => {
    // A client nothing has touched yet, so the first call is genuinely the first.
    const fresh = (await prisma.client.create({ data: { businessId: biz, name: `Fresh ${stamp()}` } })).id;
    const first = await ensureClientFolder(biz, fresh, "GOOGLE_DRIVE");
    expect(first.ok).toBe(true);
    const made = calls.filter((c) => c.url.includes("/drive/v3/files?") && c.method === "POST").length;
    calls.length = 0;
    const second = await ensureClientFolder(biz, fresh, "GOOGLE_DRIVE");
    expect(second.ok).toBe(true);
    expect(calls.filter((c) => c.url.includes("/drive/v3/files?") && c.method === "POST")).toHaveLength(0);
    expect(made).toBeGreaterThan(0);
    const views = await clientFiles(biz, fresh);
    expect(views.some((v) => v.provider === "GOOGLE_DRIVE" && v.folder)).toBe(true);
  });

  it("a client with no way to reach them is told so rather than silently not sent", async () => {
    const r = await sendClientFolder(biz, noEmailId, "GOOGLE_DRIVE", {});
    expect(r).toMatchObject({ ok: false });
    if (!r.ok) expect(r.error).toMatch(/email address/i);
  });
});
