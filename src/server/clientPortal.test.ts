import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "@/lib/db";
import type { SessionPayload } from "@/lib/auth";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); } }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "198.51.100.101" }), cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }));

import { requireClientRecord, sendPortalMessage } from "@/app/actions/portal";
import { portalDeliveries } from "@/server/portalDeliveries";

/**
 * The portal from a real customer's side, and from the side of somebody who wants to read
 * their neighbour's. Two clients of the same business, each with their own booking,
 * conversation and delivered files — which is the case a single-tenant check would miss,
 * because both of them legitimately belong to this workspace.
 */
const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

type Person = { userId: string; clientId: string; session: SessionPayload; bookingId: string; conversationId: string; secret: string };

describe("the client portal", () => {
  const ids: string[] = [];
  let businessId: string;
  let ada: Person;
  let bruno: Person;

  const build = async (name: string, businessId: string, serviceId: string): Promise<Person> => {
    const s = stamp();
    const user = await prisma.user.create({ data: { name, email: `${name.toLowerCase()}-${s}@example.test`, passwordHash: "x" } });
    await prisma.orgMembership.create({ data: { userId: user.id, businessId, role: "CLIENT" } });
    const client = await prisma.client.create({ data: { businessId, name, email: `${name.toLowerCase()}-${s}@example.test`, userId: user.id } });
    const secret = `${name}-private-${s}`;
    const conversation = await prisma.conversation.create({ data: { businessId, clientId: client.id, channel: "EMAIL", externalHandle: client.email!, lastMessageAt: new Date(), category: "PRIORITY" } });
    await prisma.message.create({ data: { conversationId: conversation.id, direction: "INBOUND", body: secret } });
    const booking = await prisma.booking.create({
      data: {
        businessId,
        clientId: client.id,
        serviceId,
        startAt: new Date(Date.now() - 7 * 86_400_000),
        endAt: new Date(Date.now() - 7 * 86_400_000 + 3_600_000),
        status: "COMPLETED",
        totalCents: 20_000,
        deliveryUrl: `https://drive.google.com/drive/folders/${name.toLowerCase()}-gallery`,
        deliveredAt: new Date(),
        deliveryNote: `${name}, your files are ready.`,
      },
    });
    return { userId: user.id, clientId: client.id, session: { userId: user.id, activeBusinessId: businessId }, bookingId: booking.id, conversationId: conversation.id, secret };
  };

  beforeAll(async () => {
    const s = stamp();
    const business = await prisma.business.create({ data: { name: "Portal Co", handle: `portal-${s}`, timezone: "America/Chicago" } });
    businessId = business.id;
    ids.push(business.id);
    const service = await prisma.service.create({ data: { businessId, name: "Session", priceCents: 20_000, durationMins: 60 } });
    ada = await build("Ada", businessId, service.id);
    bruno = await build("Bruno", businessId, service.id);
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { orgMemberships: { some: { businessId: { in: ids } } } } });
    await prisma.business.deleteMany({ where: { id: { in: ids } } });
  });

  it("resolves the signed-in customer's own record, and only that one", async () => {
    const ctx = await requireClientRecord(ada.session);
    expect(ctx?.client.id).toBe(ada.clientId);
    expect(ctx?.client.id).not.toBe(bruno.clientId);
  });

  it("shows a customer the files that were actually sent to them", async () => {
    const mine = await portalDeliveries(businessId, ada.clientId);
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((d) => d.url.includes("ada-gallery"))).toBe(true);
    expect(JSON.stringify(mine)).not.toContain("bruno-gallery");
  });

  it("does not show a folder that was made but never sent", async () => {
    // Creating and even sharing a folder is not the same as sending it. Only the moment the
    // business pressed send puts it in front of the customer.
    await prisma.client.update({
      where: { id: ada.clientId },
      data: { externalFolders: { GOOGLE_DRIVE: { id: "f1", url: "https://drive.google.com/drive/folders/not-sent", createdAt: new Date().toISOString(), sharedAt: new Date().toISOString(), sharedWith: "ada@example.test" } } },
    });
    const mine = await portalDeliveries(businessId, ada.clientId);
    expect(JSON.stringify(mine)).not.toContain("not-sent");

    // Once it is sent, it appears.
    await prisma.client.update({
      where: { id: ada.clientId },
      data: { externalFolders: { GOOGLE_DRIVE: { id: "f1", url: "https://drive.google.com/drive/folders/now-sent", createdAt: new Date().toISOString(), deliveredAt: new Date().toISOString(), deliveredVia: "EMAIL" } } },
    });
    const after = await portalDeliveries(businessId, ada.clientId);
    expect(after.some((d) => d.url.includes("now-sent"))).toBe(true);
    expect(after.find((d) => d.url.includes("now-sent"))?.source).toBe("Google Drive");
  });

  it("a customer id from the same workspace still only answers for the caller who owns it", async () => {
    // portalDeliveries takes an id, so the page must pass the caller's own. Proving the two
    // never bleed into each other keeps a future caller from passing the wrong one.
    const theirs = await portalDeliveries(businessId, bruno.clientId);
    expect(theirs.every((d) => d.url.includes("bruno-gallery") || d.title === "Your files")).toBe(true);
    expect(JSON.stringify(theirs)).not.toContain("ada-gallery");
  });

  it("a customer cannot write into another customer's conversation", async () => {
    await expect(sendPortalMessage(bruno.conversationId, "Let me read your thread", ada.session)).rejects.toThrow();
    const written = await prisma.message.count({ where: { conversationId: bruno.conversationId, body: "Let me read your thread" } });
    expect(written).toBe(0);
  });

  it("a customer can write into their own", async () => {
    const body = `Thanks for the files ${stamp()}`;
    await sendPortalMessage(ada.conversationId, body, ada.session);
    expect(await prisma.message.count({ where: { conversationId: ada.conversationId, body } })).toBe(1);
  });

  it("a session naming a workspace the customer does not belong to never reaches it", async () => {
    const other = await prisma.business.create({ data: { name: "Elsewhere", handle: `elsewhere-${stamp()}` } });
    ids.push(other.id);
    const otherService = await prisma.service.create({ data: { businessId: other.id, name: "Theirs", priceCents: 1, durationMins: 30 } });
    const stranger = await build("Stranger", other.id, otherService.id);

    // Ada belongs to one workspace, so a session pointing anywhere else resolves back to
    // hers rather than following the id it was handed.
    const ctx = await requireClientRecord({ userId: ada.userId, activeBusinessId: other.id });
    expect(ctx?.business.id).toBe(businessId);
    expect(ctx?.business.id).not.toBe(other.id);
    expect(ctx?.client.id).toBe(ada.clientId);

    // And nothing of the other workspace's customer is reachable through it.
    const seen = await portalDeliveries(ctx!.business.id, ctx!.client.id);
    expect(JSON.stringify(seen)).not.toContain("stranger-gallery");
    await expect(sendPortalMessage(stranger.conversationId, "hello", ada.session)).rejects.toThrow();
  });

  it("a staff login is not a portal login", async () => {
    const s = stamp();
    const owner = await prisma.user.create({ data: { name: "Owner", email: `portal-owner-${s}@example.test`, passwordHash: "x" } });
    await prisma.orgMembership.create({ data: { userId: owner.id, businessId, role: "OWNER" } });
    // The portal is for customers. An owner has no client record, and must not be handed one.
    expect(await requireClientRecord({ userId: owner.id, activeBusinessId: businessId })).toBeNull();
  });

  it("a suspended customer loses the portal", async () => {
    await prisma.orgMembership.updateMany({ where: { userId: bruno.userId, businessId }, data: { status: "SUSPENDED" } });
    expect(await requireClientRecord(bruno.session)).toBeNull();
    await prisma.orgMembership.updateMany({ where: { userId: bruno.userId, businessId }, data: { status: "ACTIVE" } });
    expect((await requireClientRecord(bruno.session))?.client.id).toBe(bruno.clientId);
  });
});
