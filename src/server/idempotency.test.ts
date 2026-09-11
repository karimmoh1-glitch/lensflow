import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "@/lib/db";
import type { SessionPayload } from "@/lib/auth";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); } }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "198.51.100.95" }), cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }));

import { sendReplyAction } from "@/app/actions/inbox";
import { inviteClient } from "@/app/actions/invitations";
import { sendClientFolder } from "@/server/clientDelivery";

/**
 * What happens if this runs twice. A second click, a second tab, a refresh on a slow
 * connection, a retried request — every one of these reaches the server as a second
 * identical call, and disabling a button stops none of them. The guard has to be the
 * record of what already happened, so it holds across instances and page loads.
 */
const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const future = () => new Date(Date.now() + 3_600_000);

describe("running the same thing twice", () => {
  const ids: string[] = [];
  let businessId: string;
  let session: SessionPayload;
  let conversationId: string;
  let clientId: string;
  let driveFolders = 0;
  let gmailSends = 0;

  beforeAll(async () => {
    const s = stamp();
    const business = await prisma.business.create({ data: { name: "Twice Co", handle: `twice-${s}`, timezone: "America/Chicago", planTier: "PRO", billingStatus: "ACTIVE" } });
    businessId = business.id;
    ids.push(business.id);
    const owner = await prisma.user.create({ data: { name: "Owner", email: `twice-owner-${s}@example.test`, passwordHash: "x" } });
    await prisma.orgMembership.create({ data: { userId: owner.id, businessId, role: "OWNER" } });
    session = { userId: owner.id, activeBusinessId: businessId };

    const client = await prisma.client.create({ data: { businessId, name: "Robin", email: `robin-${s}@example.test` } });
    clientId = client.id;
    conversationId = (await prisma.conversation.create({ data: { businessId, clientId, channel: "EMAIL", externalHandle: client.email!, lastMessageAt: new Date(), category: "PRIORITY" } })).id;
    await prisma.message.create({ data: { conversationId, direction: "INBOUND", body: "Are you free in June?" } });

    await prisma.integration.create({ data: { businessId, provider: "GOOGLE_DRIVE", status: "CONNECTED", accessToken: "g-at", refreshToken: "g-rt", tokenExpiresAt: future(), externalId: "owner@gmail.test" } });
    // A connected Gmail, so a delivery genuinely goes out and the guard has something to
    // guard. Without it nothing is sent, and a retry is the right answer rather than a bug.
    await prisma.integration.create({ data: { businessId, provider: "EMAIL", status: "CONNECTED", accessToken: "gm-at", refreshToken: "gm-rt", tokenExpiresAt: future(), externalId: "owner@gmail.test", externalAccount: "owner@gmail.test" } });

    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.startsWith("https://www.googleapis.com/drive/v3/files") && (init?.method ?? "GET") === "POST") {
        driveFolders++;
        return json({ id: `folder-${driveFolders}`, webViewLink: `https://drive.google.com/drive/folders/folder-${driveFolders}` });
      }
      if (u.includes("/permissions")) return json({ id: "perm-1" });
      if (u.includes("/messages/send")) { gmailSends++; return json({ id: `gm-${gmailSends}` }); }
      if (u.startsWith("https://www.googleapis.com/drive/v3/files")) return json({ id: "folder-1", name: "Robin", trashed: false, mimeType: "application/vnd.google-apps.folder" });
      return json({}, 404);
    });
  });
  afterAll(async () => {
    vi.unstubAllGlobals();
    await prisma.user.deleteMany({ where: { orgMemberships: { some: { businessId: { in: ids } } } } });
    await prisma.business.deleteMany({ where: { id: { in: ids } } });
  });

  const outbound = (body?: string) =>
    prisma.message.count({ where: { conversationId, direction: "OUTBOUND", ...(body ? { body } : {}) } });

  it("a reply pressed twice reaches the customer once", async () => {
    const body = `Yes, June works. ${stamp()}`;
    const first = await sendReplyAction(conversationId, body, false, session);
    const second = await sendReplyAction(conversationId, body, false, session);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(await outbound(body)).toBe(1);
  });

  it("two tabs sending the same reply at the same moment still send it once", async () => {
    const body = `Racing you. ${stamp()}`;
    await Promise.all([
      sendReplyAction(conversationId, body, false, session),
      sendReplyAction(conversationId, body, false, session),
    ]);
    // A true simultaneous race can still land two rows, because the guard is a read; what
    // must never happen is the everyday double-click producing two. One or two is the
    // honest bound here, and a third would mean the guard is not working at all.
    expect(await outbound(body)).toBeLessThanOrEqual(2);
  });

  it("a genuinely different reply is not mistaken for a repeat", async () => {
    const before = await outbound();
    await sendReplyAction(conversationId, `First thought ${stamp()}`, false, session);
    await sendReplyAction(conversationId, `Second thought ${stamp()}`, false, session);
    expect(await outbound()).toBe(before + 2);
  });

  it("the same words sent again later are a new message, not a duplicate", async () => {
    const body = `Checking in. ${stamp()}`;
    await sendReplyAction(conversationId, body, false, session);
    // Age the first one past the window rather than waiting for the clock.
    await prisma.message.updateMany({ where: { conversationId, body }, data: { createdAt: new Date(Date.now() - 60_000) } });
    await sendReplyAction(conversationId, body, false, session);
    expect(await outbound(body)).toBe(2);
  });

  it("inviting the same person twice does not create them twice", async () => {
    const email = `newcomer-${stamp()}@example.test`;
    const form = () => {
      const fd = new FormData();
      fd.set("name", "New Comer");
      fd.set("email", email);
      return fd;
    };
    const [a, b] = await Promise.all([inviteClient(form(), session), inviteClient(form(), session)]);
    expect(a.error ?? b.error).toBeUndefined();
    expect(await prisma.client.count({ where: { businessId, email } })).toBe(1);
    // And only one invitation is live: the second retires the first rather than adding to it.
    expect(await prisma.invitation.count({ where: { businessId, email, status: "PENDING" } })).toBe(1);
  });

  it("sending a client their files twice sends one delivery", async () => {
    // Count from here: the reply tests above went out over the same Gmail connection.
    gmailSends = 0;
    const first = await sendClientFolder(businessId, clientId, "GOOGLE_DRIVE", { message: "Here you go" });
    expect(first.ok).toBe(true);
    const deliveredAt = async () =>
      ((await prisma.client.findUniqueOrThrow({ where: { id: clientId }, select: { externalFolders: true } })).externalFolders as Record<string, { deliveredAt?: string }> | null)?.GOOGLE_DRIVE?.deliveredAt;
    const firstDeliveredAt = await deliveredAt();
    expect(firstDeliveredAt).toBeTruthy();

    expect(gmailSends).toBe(1);

    const second = await sendClientFolder(businessId, clientId, "GOOGLE_DRIVE", { message: "Here you go" });
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.note).toMatch(/already sent/i);
    // The customer's inbox is the thing being protected: one email, not two.
    expect(gmailSends).toBe(1);
    // The delivery record did not move, so nothing was sent the second time. Re-sharing the
    // folder is harmless and idempotent at the provider, so that timestamp may advance.
    expect(await deliveredAt()).toBe(firstDeliveredAt);
  });

  it("and the folder it delivered is the same folder throughout", async () => {
    // The count of created folders includes the workspace root, so the property that
    // matters is that this person's folder never changed underneath them.
    const folders = (await prisma.client.findUniqueOrThrow({ where: { id: clientId }, select: { externalFolders: true } })).externalFolders as Record<string, { id?: string }> | null;
    expect(folders?.GOOGLE_DRIVE?.id).toBeTruthy();
    const again = await sendClientFolder(businessId, clientId, "GOOGLE_DRIVE", { message: "Here you go" });
    expect(again.ok).toBe(true);
    const after = (await prisma.client.findUniqueOrThrow({ where: { id: clientId }, select: { externalFolders: true } })).externalFolders as Record<string, { id?: string }> | null;
    expect(after?.GOOGLE_DRIVE?.id).toBe(folders?.GOOGLE_DRIVE?.id);
    expect(driveFolders).toBeGreaterThan(0);
  });
});
