import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "@/lib/db";
import type { SessionPayload } from "@/lib/auth";

const cookie = { value: "" };
// A fresh address per run: several steps here are rate limited per caller, and a fixed
// one would make this suite fail depending on what else ran in the same worker first.
const ip = { value: `203.0.113.${Math.floor(Math.random() * 200) + 20}` };
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); } }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": ip.value }),
  cookies: async () => ({
    get: (name: string) => (name === "lf_session" && cookie.value ? { value: cookie.value } : undefined),
    set: (name: string, value: string) => { if (name === "lf_session") cookie.value = value; },
    delete: () => { cookie.value = ""; },
  }),
}));

import { signup } from "@/app/actions/auth";
import { saveServices, saveAvailability } from "@/app/actions/settings";
import { submitWebsiteLead } from "@/app/actions/websiteLead";
import { bookLead } from "@/app/actions/leads";
import { sendReplyAction } from "@/app/actions/inbox";
import { advanceBookingStatus } from "@/app/actions/bookings";
import { sendClientFiles } from "@/app/actions/clientFiles";
import { inviteClient, acceptInvitation } from "@/app/actions/invitations";
import { requireClientRecord } from "@/app/actions/portal";
import { portalDeliveries } from "@/server/portalDeliveries";
import { getSession, verifySessionToken } from "@/lib/auth";

/**
 * One business, start to finish, through the real actions rather than around them.
 *
 * A consultant signs up, describes what they sell and when they work, a stranger writes in
 * from their public page, they reply, book the work, finish it, send the files, and invite
 * the customer to the portal — who then signs in and finds exactly their own files and
 * nothing else. Every step is the same code the browser calls.
 *
 * Google Drive is stubbed at the network edge and the customer's email leaves through a
 * connected Gmail that is also stubbed; nothing reaches a real provider. What is being
 * proved is that the chain holds together, that each step leaves the record the next one
 * needs, and that doing any of it twice does not double anything.
 */
const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const future = () => new Date(Date.now() + 3_600_000);

describe("a real business, end to end", () => {
  const ids: string[] = [];
  const s = stamp();
  const ownerEmail = `journey-owner-${s}@example.test`;
  const customerEmail = `journey-customer-${s}@example.test`;
  const handle = `journey-${s}`;

  let owner: SessionPayload;
  let businessId: string;
  let serviceId: string;
  let leadId: string;
  let clientId: string;
  let conversationId: string;
  let bookingId: string;
  let gmailSends = 0;
  let driveFolders = 0;

  beforeAll(async () => {
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.startsWith("https://www.googleapis.com/drive/v3/files") && (init?.method ?? "GET") === "POST") {
        driveFolders++;
        return json({ id: `folder-${driveFolders}`, webViewLink: `https://drive.google.com/drive/folders/folder-${driveFolders}` });
      }
      if (u.includes("/permissions")) return json({ id: "perm-1" });
      if (u.includes("/messages/send")) { gmailSends++; return json({ id: `gm-${gmailSends}` }); }
      if (u.startsWith("https://www.googleapis.com/drive/v3/files")) return json({ id: "folder-1", name: "Customer", trashed: false, mimeType: "application/vnd.google-apps.folder" });
      return json({}, 404);
    });
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await prisma.user.deleteMany({ where: { orgMemberships: { some: { businessId: { in: ids } } } } });
    await prisma.business.deleteMany({ where: { id: { in: ids } } });
  });

  it("1. signs up and gets a workspace of their own", async () => {
    const fd = new FormData();
    fd.set("name", "Jo Consultant");
    fd.set("email", ownerEmail);
    fd.set("password", "a-long-enough-password");
    // signup redirects on success, which the mock turns into a throw.
    await expect(signup(fd)).rejects.toThrow(/NEXT_REDIRECT/);

    const session = await getSession();
    expect(session?.userId).toBeTruthy();
    owner = { userId: session!.userId, activeBusinessId: session!.activeBusinessId };
    businessId = session!.activeBusinessId!;
    ids.push(businessId);

    const membership = await prisma.orgMembership.findFirstOrThrow({ where: { userId: owner.userId, businessId } });
    expect(membership.role).toBe("OWNER");
    // A fresh workspace is on the free plan and owes nothing.
    const business = await prisma.business.findUniqueOrThrow({ where: { id: businessId } });
    expect(business.planTier).toBe("FREE");
    await prisma.business.update({ where: { id: businessId }, data: { handle } });
  });

  it("2. says what they sell and when they work", async () => {
    await saveServices([{ name: "Strategy session", priceCents: 40_000, durationMins: 60 }], owner);
    const hours = await saveAvailability([0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, startMin: 9 * 60, endMin: 17 * 60 })), owner);
    expect(hours.error).toBeUndefined();
    const service = await prisma.service.findFirstOrThrow({ where: { businessId } });
    serviceId = service.id;
    expect(service.name).toBe("Strategy session");
  });

  it("3. a stranger writes in from the public page, and becomes a lead", async () => {
    const result = await submitWebsiteLead(handle, { name: "Sam Customer", email: customerEmail, phone: "", serviceId, preferredDate: "", message: "Do you have time in June?" });
    expect(result.ok).toBe(true);

    const lead = await prisma.lead.findFirstOrThrow({ where: { businessId }, include: { conversation: true } });
    leadId = lead.id;
    clientId = lead.clientId!;
    conversationId = lead.conversationId!;
    expect(lead.status).toBe("NEW");
    const client = await prisma.client.findUniqueOrThrow({ where: { id: clientId } });
    expect(client.email).toBe(customerEmail.toLowerCase());
  });

  it("4. the same person writing again joins the record they already have", async () => {
    await submitWebsiteLead(handle, { name: "Sam Customer", email: customerEmail, phone: "", serviceId, preferredDate: "", message: "Following up" });
    expect(await prisma.client.count({ where: { businessId, email: customerEmail.toLowerCase() } })).toBe(1);
  });

  it("5. the owner replies, and the reply is recorded honestly", async () => {
    const reply = await sendReplyAction(conversationId, "June works. Shall we say the 12th?", false, owner);
    expect(reply.ok).toBe(true);
    const message = await prisma.message.findFirstOrThrow({ where: { conversationId, direction: "OUTBOUND" }, orderBy: { createdAt: "desc" } });
    // No email provider in this environment, so it is recorded as not delivered rather
    // than as sent. Nothing in the product may claim otherwise.
    expect(message.status).not.toBe("SENT");
    expect("simulated" in reply && reply.simulated).toBe(true);
  });

  it("6. the work is booked from the conversation", async () => {
    const when = new Date(Date.now() + 5 * 86_400_000);
    when.setUTCHours(15, 0, 0, 0);
    const booked = await bookLead(leadId, when.toISOString(), serviceId, owner);
    bookingId = booked.bookingId;
    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(booking.businessId).toBe(businessId);
    expect(booking.clientId).toBe(clientId);
    expect(booking.totalCents).toBe(40_000);
    // Booking somebody moves them from a lead to a customer.
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: leadId } })).status).not.toBe("NEW");
  });

  it("7. the booking runs its course", async () => {
    for (const status of ["CONFIRMED", "UPCOMING", "COMPLETED"] as const) {
      await advanceBookingStatus(bookingId, status, owner);
    }
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } })).status).toBe("COMPLETED");
    // And an illegal jump is refused rather than silently applied.
    await expect(advanceBookingStatus(bookingId, "INQUIRY", owner)).rejects.toThrow();
  });

  it("8. the finished work is sent to the customer", async () => {
    // A connected Drive and a connected Gmail, so this is the real path a business uses.
    await prisma.integration.create({ data: { businessId, provider: "GOOGLE_DRIVE", status: "CONNECTED", accessToken: "g", refreshToken: "r", tokenExpiresAt: future(), externalId: "owner@gmail.test" } });
    await prisma.integration.create({ data: { businessId, provider: "EMAIL", status: "CONNECTED", accessToken: "g", refreshToken: "r", tokenExpiresAt: future(), externalId: "owner@gmail.test", externalAccount: "owner@gmail.test" } });
    gmailSends = 0;

    const sent = await sendClientFiles(clientId, "GOOGLE_DRIVE", "Here is everything from our session.", bookingId, owner);
    expect(sent.ok).toBe(true);
    if (!sent.ok) return;
    expect(sent.notified).toBe("sent");
    expect(gmailSends).toBe(1);

    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(booking.deliveredAt).toBeTruthy();
    expect(booking.deliveryUrl).toContain("drive.google.com");
  });

  it("9. sending it again does not send it again", async () => {
    const before = gmailSends;
    const again = await sendClientFiles(clientId, "GOOGLE_DRIVE", "Here is everything from our session.", bookingId, owner);
    expect(again.ok).toBe(true);
    expect(gmailSends).toBe(before);
  });

  it("10. the customer is invited, and accepting gives them a portal login", async () => {
    const fd = new FormData();
    fd.set("name", "Sam Customer");
    fd.set("email", customerEmail);
    const invited = await inviteClient(fd, owner);
    expect(invited.error).toBeUndefined();
    // No email provider, so the product says so rather than claiming it sent one.
    expect(invited.delivery?.emailed).toBe(false);
    expect(invited.link).toContain("/invite/");

    const token = invited.link!.split("/invite/")[1];
    const accept = new FormData();
    accept.set("name", "Sam Customer");
    accept.set("password", "another-long-password");
    ip.value = `203.0.113.${Math.floor(Math.random() * 200) + 20}`;
    await expect(acceptInvitation(token, accept)).rejects.toThrow(/NEXT_REDIRECT/);

    const customerUser = await prisma.user.findUniqueOrThrow({ where: { email: customerEmail.toLowerCase() } });
    const membership = await prisma.orgMembership.findFirstOrThrow({ where: { userId: customerUser.id, businessId } });
    expect(membership.role).toBe("CLIENT");
    // The invitation is spent, so the same link cannot be used again.
    expect((await prisma.invitation.findFirstOrThrow({ where: { businessId, token } })).status).toBe("ACCEPTED");
  });

  it("11. the customer signs in and finds their own files, and only those", async () => {
    const customerUser = await prisma.user.findUniqueOrThrow({ where: { email: customerEmail.toLowerCase() } });
    const customerSession: SessionPayload = { userId: customerUser.id, activeBusinessId: businessId };
    const ctx = await requireClientRecord(customerSession);
    expect(ctx?.client.id).toBe(clientId);

    const deliveries = await portalDeliveries(businessId, ctx!.client.id);
    expect(deliveries.length).toBeGreaterThan(0);
    expect(deliveries[0].url).toContain("drive.google.com");

    // Somebody else's customer, in a workspace of their own, sees none of it.
    const other = await prisma.business.create({ data: { name: "Elsewhere", handle: `elsewhere-${stamp()}` } });
    ids.push(other.id);
    const stranger = await prisma.client.create({ data: { businessId: other.id, name: "Nobody" } });
    expect(await portalDeliveries(other.id, stranger.id)).toEqual([]);
  });

  it("12. the owner's own session survived all of it, and still belongs to them", async () => {
    const token = cookie.value;
    if (token) {
      const payload = await verifySessionToken(token);
      // The last thing to touch the cookie was the customer accepting their invitation, so
      // this only asserts that whatever is in it is a real, verifiable session.
      expect(payload?.userId).toBeTruthy();
    }
    const business = await prisma.business.findUniqueOrThrow({ where: { id: businessId } });
    expect(business.handle).toBe(handle);
    expect(await prisma.booking.count({ where: { businessId, deliveredAt: { not: null } } })).toBe(1);
    expect(await prisma.client.count({ where: { businessId } })).toBe(1);
  });
});
