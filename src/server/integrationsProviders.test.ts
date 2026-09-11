import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import Stripe from "stripe";
import { prisma } from "@/lib/db";

/**
 * Each new provider against the real database with the provider stubbed at the network
 * edge by URL: Outlook (delta sync, threading), Microsoft Calendar (busy pull, mirrors,
 * push), Calendly (signature, import, webhook route, tenant routing), Stripe Connect
 * (payments recorded once, refunds, deauthorization, the signed route), and the client
 * folders in Google Drive. Nothing here reaches a real provider.
 */
// The Stripe client is built when its module loads, so the dummy key must exist before any import.
vi.hoisted(() => { process.env.STRIPE_SECRET_KEY = "sk_test_dummy"; process.env.STRIPE_CONNECT_CLIENT_ID = "ca_test"; process.env.STRIPE_CONNECT_WEBHOOK_SECRET = "whsec_connect_test"; });
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }));
vi.mock("@/lib/stripeConnect", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/stripeConnect")>();
  return { ...mod, connectedChargeDetails: async () => ({ name: "Jane Payer", email: "jane.payer@example.test", phone: null, receiptUrl: null }) };
});

import { syncOutlookForBusiness } from "@/server/outlookSync";
import { syncCalendarIn, pushBookingToCalendars } from "@/server/calendarSync";
import { deliverToCustomer } from "@/server/deliver";
import { applyCalendlyEvent } from "@/server/calendlySync";
import { verifyCalendlySignature, calendlySigningKey, rawToEvent } from "@/lib/calendly";
import { handleStripeConnectEvent } from "@/server/stripeConnectEvents";
import { ensureClientFolder, clientFiles } from "@/server/clientFiles";
import { createHmac } from "crypto";

const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const future = () => new Date(Date.now() + 3600_000);
type Call = { url: string; method: string; body: unknown; headers: Record<string, string> };
const calls: Call[] = [];
let route: (url: string, call: Call) => Response | Promise<Response> = () => json({});
const record = (url: string, init?: RequestInit): Call => {
  const headers = Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]));
  let body: unknown = null;
  if (typeof init?.body === "string") { try { body = JSON.parse(init.body); } catch { body = init.body; } }
  const call = { url: String(url), method: init?.method ?? "GET", body, headers };
  calls.push(call);
  return call;
};

async function business(name: string) {
  const biz = await prisma.business.create({ data: { name, handle: `${name.toLowerCase().replace(/\W+/g, "-")}-${stamp()}` } });
  await prisma.service.create({ data: { businessId: biz.id, name: "Portrait session", priceCents: 25_000, durationMins: 60 } });
  return biz.id;
}

beforeAll(() => { vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => route(String(url), record(url, init))); });
afterEach(() => { calls.length = 0; });
afterAll(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("Outlook", () => {
  let a: string;
  const msg = (id: string, from: string, over: Record<string, unknown> = {}) => ({ id, internetMessageId: `<${id}@mail.example.test>`, subject: "Saturday?", receivedDateTime: new Date().toISOString(), from: { emailAddress: { name: "Cara Customer", address: from } }, body: { contentType: "text", content: "Do you have Saturday open for a portrait session?" }, ...over });
  beforeAll(async () => {
    a = await business("Outlook A");
    await prisma.integration.create({ data: { businessId: a, provider: "MICROSOFT_OUTLOOK", status: "CONNECTED", accessToken: "ms-at", refreshToken: "ms-rt", tokenExpiresAt: future(), externalId: "ms-user-1", externalAccount: "owner@outlook.example.test" } });
  });
  afterAll(async () => { await prisma.business.delete({ where: { id: a } }); });

  it("pulls the inbox delta, ingests only real inbound mail once, and stores the delta link as the cursor", async () => {
    route = (url) => {
      if (url.includes("/messages/delta")) return json({ value: [msg("m1", "cara@example.test"), msg("m-self", "owner@outlook.example.test"), msg("m-draft", "x@example.test", { isDraft: true }), { id: "m-gone", "@removed": { reason: "deleted" } }], "@odata.deltaLink": "https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages/delta?$deltatoken=abc" });
      return json({});
    };
    const r = await syncOutlookForBusiness(a);
    expect(r).toMatchObject({ ok: true, found: 1, ingested: 1 }); // the mailbox's own mail, the draft and the removal are not inbound
    const row = await prisma.integration.findUnique({ where: { businessId_provider: { businessId: a, provider: "MICROSOFT_OUTLOOK" } } });
    expect(row?.syncCursor).toContain("$deltatoken=abc");
    expect(row?.lastSyncStatus).toBe("ok");
    expect(await prisma.message.count({ where: { conversation: { businessId: a }, direction: "INBOUND" } })).toBe(1);
    // The first call carried the delta-link the row had; the next run uses the stored link and the same message is a duplicate.
    const again = await syncOutlookForBusiness(a);
    expect(again).toMatchObject({ ok: true, ingested: 0 });
    expect(calls.some((c) => c.url.includes("$deltatoken=abc"))).toBe(true);
    expect(await prisma.message.count({ where: { conversation: { businessId: a }, direction: "INBOUND" } })).toBe(1);
  });

  it("a stale delta link starts over from a time window instead of failing; a revoked grant needs attention", async () => {
    route = (url) => {
      if (url.includes("$deltatoken=abc")) return json({ error: { code: "SyncStateNotFound", message: "stale" } }, 410);
      if (url.includes("/messages/delta")) return json({ value: [msg("m2", "dan@example.test")], "@odata.deltaLink": "https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages/delta?$deltatoken=def" });
      return json({});
    };
    expect(await syncOutlookForBusiness(a)).toMatchObject({ ok: true, ingested: 1 });
    route = () => json({ error: { code: "InvalidAuthenticationToken", message: "expired" } }, 401);
    const r = await syncOutlookForBusiness(a);
    expect(r.ok).toBe(false);
    expect((await prisma.integration.findUnique({ where: { businessId_provider: { businessId: a, provider: "MICROSOFT_OUTLOOK" } } }))?.status).toBe("NEEDS_ATTENTION");
    await prisma.integration.update({ where: { businessId_provider: { businessId: a, provider: "MICROSOFT_OUTLOOK" } }, data: { status: "CONNECTED" } });
  });

  it("replies stay in the customer's thread through Graph's own reply; a fresh mail uses sendMail", async () => {
    route = (url, call) => {
      if (url.includes("/me/messages?$filter=")) return json({ value: [{ id: "graph-id-1" }] });
      if (url.endsWith("/createReply")) return json({ id: "draft-1" });
      if (url.includes("/me/messages/draft-1") && call.method === "PATCH") return json({ id: "draft-1" });
      if (url.endsWith("/draft-1/send")) return new Response(null, { status: 202 });
      if (url.endsWith("/me/sendMail")) return new Response(null, { status: 202 });
      return json({});
    };
    const reply = await deliverToCustomer({ businessId: a, businessName: "Outlook A", businessHandle: "x", channel: "EMAIL", to: "cara@example.test", body: "Yes, Saturday at 2 works.", inReplyTo: "<m1@mail.example.test>" });
    expect(reply).toMatchObject({ status: "SENT", via: "outlook", providerMessageId: "draft-1" });
    const patched = calls.find((c) => c.method === "PATCH");
    expect((patched?.body as { body: { content: string } }).body.content).toBe("Yes, Saturday at 2 works.");
    const fresh = await deliverToCustomer({ businessId: a, businessName: "Outlook A", businessHandle: "x", channel: "EMAIL", to: "new@example.test", body: "Hello", subject: "Hi" });
    expect(fresh).toMatchObject({ status: "SENT", via: "outlook" });
    const sent = calls.find((c) => c.url.endsWith("/me/sendMail"));
    expect((sent?.body as { message: { toRecipients: Array<{ emailAddress: { address: string } }> } }).message.toRecipients[0].emailAddress.address).toBe("new@example.test");
  });
});

describe("Microsoft Calendar", () => {
  let a: string;
  let rowId: string;
  const ev = (id: string, startH: number, over: Record<string, unknown> = {}) => ({ id, subject: `Event ${id}`, start: { dateTime: new Date(Date.now() + startH * 3600_000).toISOString().replace("Z", "0000"), timeZone: "UTC" }, end: { dateTime: new Date(Date.now() + (startH + 1) * 3600_000).toISOString().replace("Z", "0000"), timeZone: "UTC" }, showAs: "busy", "@odata.etag": `W/"${id}"`, ...over });
  beforeAll(async () => {
    a = await business("MS Cal A");
    const row = await prisma.integration.create({ data: { businessId: a, provider: "MICROSOFT_CALENDAR", status: "CONNECTED", accessToken: "ms-at", refreshToken: "ms-rt", tokenExpiresAt: future(), externalId: "ms-user-2", externalAccount: "owner@outlook.example.test", settings: { available: [{ id: "cal1", name: "Calendar", primary: true }], selected: ["cal1"], bookingCalendar: "cal1", cursors: {} } } });
    rowId = row.id;
  });
  afterAll(async () => { await prisma.business.delete({ where: { id: a } }); });

  it("busy events block, free and cancelled ones don't, removals disappear, the delta link is the cursor, and a mirror is recognised by its booking", async () => {
    const client = await prisma.client.create({ data: { businessId: a, name: "Mirror Client" } });
    const service = await prisma.service.findFirstOrThrow({ where: { businessId: a } });
    const booking = await prisma.booking.create({ data: { businessId: a, clientId: client.id, serviceId: service.id, startAt: new Date(Date.now() + 48 * 3600_000), endAt: new Date(Date.now() + 49 * 3600_000), status: "CONFIRMED", totalCents: 0, externalCalendarProvider: "MICROSOFT_CALENDAR", externalEventId: "ev-mirror" } });
    route = (url) => {
      if (url.includes("/calendarView/delta")) return json({ value: [ev("ev-busy", 24), ev("ev-free", 26, { showAs: "free" }), ev("ev-cancel", 28, { isCancelled: true }), ev("ev-mirror", 48), { id: "ev-old", "@removed": { reason: "deleted" } }], "@odata.deltaLink": "https://graph.microsoft.com/v1.0/me/calendars/cal1/calendarView/delta?$deltatoken=cal-abc" });
      return json({});
    };
    const row = await prisma.integration.findUniqueOrThrow({ where: { id: rowId } });
    const r = await syncCalendarIn(row);
    expect(r.ok).toBe(true);
    const events = await prisma.externalEvent.findMany({ where: { integrationId: rowId } });
    const by = Object.fromEntries(events.map((e) => [e.externalId, e]));
    expect(by["ev-busy"]?.transparent).toBe(false);
    expect(by["ev-free"]?.transparent).toBe(true);
    expect(by["ev-cancel"]).toBeUndefined();
    expect(by["ev-mirror"]?.bookingId).toBe(booking.id);
    const settings = (await prisma.integration.findUniqueOrThrow({ where: { id: rowId } })).settings as { cursors: Record<string, string> };
    expect(settings.cursors.cal1).toContain("cal-abc");
  });

  it("a booking is pushed as an event with an idempotent transaction id, updated in place afterwards, and removed on cancel", async () => {
    const client = await prisma.client.create({ data: { businessId: a, name: "Pushed Client" } });
    const service = await prisma.service.findFirstOrThrow({ where: { businessId: a } });
    const booking = await prisma.booking.create({ data: { businessId: a, clientId: client.id, serviceId: service.id, startAt: new Date(Date.now() + 72 * 3600_000), endAt: new Date(Date.now() + 73 * 3600_000), status: "CONFIRMED", totalCents: 25_000 } });
    route = (url, call) => {
      if (url.endsWith("/calendars/cal1/events") && call.method === "POST") return json({ id: "ev-new", "@odata.etag": 'W/"1"' });
      if (url.includes("/me/events/ev-new") && call.method === "PATCH") return json({ id: "ev-new", "@odata.etag": 'W/"2"' });
      if (url.includes("/me/events/ev-new") && call.method === "DELETE") return new Response(null, { status: 204 });
      return json({});
    };
    await pushBookingToCalendars(booking.id);
    const created = calls.find((c) => c.method === "POST");
    expect((created?.body as { transactionId: string }).transactionId).toBe(`daythread-${booking.id}`);
    let fresh = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(fresh).toMatchObject({ externalEventId: "ev-new", externalCalendarProvider: "MICROSOFT_CALENDAR" });
    calls.length = 0;
    await pushBookingToCalendars(booking.id);
    expect(calls.some((c) => c.method === "PATCH")).toBe(true);
    expect(calls.some((c) => c.method === "POST")).toBe(false);
    await prisma.booking.update({ where: { id: booking.id }, data: { status: "CANCELED" } });
    await pushBookingToCalendars(booking.id);
    expect(calls.some((c) => c.method === "DELETE")).toBe(true);
    fresh = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(fresh.externalEventId).toBeNull();
  });
});

describe("Calendly", () => {
  let a: string;
  let b: string;
  let rowA: { id: string };
  const userA = "https://api.calendly.com/users/USER-A";
  const userB = "https://api.calendly.com/users/USER-B";
  const event = (uri: string, startH: number, status: "active" | "canceled" = "active") => ({ uri, name: "Discovery call", status, start_time: new Date(Date.now() + startH * 3600_000).toISOString(), end_time: new Date(Date.now() + startH * 3600_000 + 1800_000).toISOString(), location: { type: "zoom", join_url: "https://zoom.example/1" }, event_type: "https://api.calendly.com/event_types/ET1" });
  let POST: (req: Request) => Promise<Response>;
  const signedRequest = (body: object, key: string, t = Math.floor(Date.now() / 1000)) => {
    const raw = JSON.stringify(body);
    const v1 = createHmac("sha256", key).update(`${t}.${raw}`).digest("hex");
    return new Request("http://localhost/api/webhooks/calendly", { method: "POST", body: raw, headers: { "content-type": "application/json", "calendly-webhook-signature": `t=${t},v1=${v1}` } });
  };
  beforeAll(async () => {
    vi.stubEnv("CALENDLY_CLIENT_ID", "cid");
    vi.stubEnv("CALENDLY_CLIENT_SECRET", "csecret");
    a = await business("Calendly A");
    b = await business("Calendly B");
    rowA = await prisma.integration.create({ data: { businessId: a, provider: "CALENDLY", status: "CONNECTED", accessToken: "cal-at", refreshToken: "cal-rt", tokenExpiresAt: future(), externalId: userA, externalAccount: "a@example.test", settings: { userUri: userA, organization: "https://api.calendly.com/organizations/O1", webhooks: "active" } } });
    await prisma.integration.create({ data: { businessId: b, provider: "CALENDLY", status: "CONNECTED", accessToken: "cal-bt", refreshToken: "cal-brt", tokenExpiresAt: future(), externalId: userB, externalAccount: "b@example.test", settings: { userUri: userB, organization: "https://api.calendly.com/organizations/O2", webhooks: "active" } } });
    ({ POST } = await import("@/app/api/webhooks/calendly/route"));
  });
  afterAll(async () => { await prisma.business.deleteMany({ where: { id: { in: [a, b] } } }); });

  it("verifies Calendly's signature: right key, fresh timestamp, exact body", () => {
    const key = calendlySigningKey(rowA.id);
    const raw = JSON.stringify({ event: "invitee.created" });
    const t = Math.floor(Date.now() / 1000);
    const v1 = createHmac("sha256", key).update(`${t}.${raw}`).digest("hex");
    expect(verifyCalendlySignature(raw, `t=${t},v1=${v1}`, key)).toBe(true);
    expect(verifyCalendlySignature(raw + " ", `t=${t},v1=${v1}`, key)).toBe(false);
    expect(verifyCalendlySignature(raw, `t=${t},v1=${v1}`, calendlySigningKey("other-row"))).toBe(false);
    expect(verifyCalendlySignature(raw, `t=${t - 900},v1=${createHmac("sha256", key).update(`${t - 900}.${raw}`).digest("hex")}`, key)).toBe(false);
    expect(verifyCalendlySignature(raw, null, key)).toBe(false);
  });

  it("a scheduled event becomes one confirmed booking for the invitee; re-applying changes nothing; a cancellation cancels it", async () => {
    const e = rawToEvent(event("https://api.calendly.com/scheduled_events/EV1", 30));
    const invitee = { uri: "inv1", name: "Ivy Invitee", email: "ivy@example.test", status: "active" as const, timezone: null, phone: "+15125550123", answers: [] };
    const row = await prisma.integration.findUniqueOrThrow({ where: { id: rowA.id } });
    expect(await applyCalendlyEvent(row, e, [invitee])).toBe("created");
    expect(await applyCalendlyEvent(row, e, [invitee])).toBe("skipped");
    const booking = await prisma.booking.findUniqueOrThrow({ where: { businessId_sourceProvider_sourceEventId: { businessId: a, sourceProvider: "CALENDLY", sourceEventId: e.uri } }, include: { client: true, service: true } });
    expect(booking.status).toBe("CONFIRMED");
    expect(booking.client).toMatchObject({ name: "Ivy Invitee", email: "ivy@example.test", relationship: "CUSTOMER" });
    expect(booking.service).toMatchObject({ name: "Discovery call", active: false });
    expect(await prisma.booking.count({ where: { businessId: a, sourceProvider: "CALENDLY" } })).toBe(1);
    expect(await prisma.notification.findFirst({ where: { businessId: a, title: "New booking from Calendly" } })).toBeTruthy();
    expect(await applyCalendlyEvent(row, { ...e, status: "canceled" }, [{ ...invitee, status: "canceled" }])).toBe("canceled");
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe("CANCELED");
    // A second invitee for the same person re-uses the client record.
    const e2 = rawToEvent(event("https://api.calendly.com/scheduled_events/EV2", 50));
    expect(await applyCalendlyEvent(row, e2, [invitee])).toBe("created");
    expect(await prisma.client.count({ where: { businessId: a, email: "ivy@example.test" } })).toBe(1);
  });

  it("the webhook route: a signed event for B's user lands in B and only B; a forged signature or unknown user is a 401", async () => {
    const rowB = await prisma.integration.findUniqueOrThrow({ where: { businessId_provider: { businessId: b, provider: "CALENDLY" } } });
    const payload = { event: "invitee.created", created_at: new Date().toISOString(), created_by: userB, payload: { uri: "https://api.calendly.com/scheduled_events/EVB/invitees/I1", name: "Ben Booker", email: "ben@example.test", status: "active", scheduled_event: event("https://api.calendly.com/scheduled_events/EVB", 40) } };
    const ok = await POST(signedRequest(payload, calendlySigningKey(rowB.id)));
    expect(ok.status).toBe(200);
    expect(await prisma.booking.count({ where: { businessId: b, sourceProvider: "CALENDLY", sourceEventId: "https://api.calendly.com/scheduled_events/EVB" } })).toBe(1);
    expect(await prisma.booking.count({ where: { businessId: a, sourceEventId: "https://api.calendly.com/scheduled_events/EVB" } })).toBe(0);
    // Redelivery is a duplicate, not a second booking.
    const dup = await POST(signedRequest(payload, calendlySigningKey(rowB.id)));
    expect(await dup.json()).toMatchObject({ duplicate: true });
    expect(await prisma.booking.count({ where: { businessId: b, sourceProvider: "CALENDLY" } })).toBe(1);
    // Signed with A's key for B's user: refused.
    expect((await POST(signedRequest({ ...payload, created_at: new Date(Date.now() + 1000).toISOString() }, calendlySigningKey(rowA.id)))).status).toBe(401);
    // An unknown Calendly user and a bad signature answer identically, so the route cannot
    // be asked which Calendly accounts use Daythread.
    const unknownUser = await POST(signedRequest({ ...payload, created_by: "https://api.calendly.com/users/NOBODY" }, calendlySigningKey(rowB.id)));
    const badSignature = await POST(signedRequest({ ...payload, created_at: new Date(Date.now() + 2000).toISOString() }, calendlySigningKey(rowA.id)));
    expect(unknownUser.status).toBe(401);
    expect(badSignature.status).toBe(401);
    expect(await unknownUser.json()).toEqual(await badSignature.json());
    expect((await prisma.integration.findUniqueOrThrow({ where: { id: rowB.id } })).lastWebhookAt).toBeTruthy();
  });
});

describe("Stripe Connect", () => {
  let a: string;
  let b: string;
  const CONNECT_SECRET = "whsec_connect_test";
  const signer = new Stripe("sk_test_dummy", { apiVersion: undefined as unknown as Stripe.LatestApiVersion });
  let POST: (req: Request) => Promise<Response>;
  let seq = 0;
  const evt = (type: string, account: string, object: object) => ({ id: `evt_conn_${Date.now()}_${++seq}`, object: "event", type, account, data: { object }, api_version: "2024-06-20", created: Math.floor(Date.now() / 1000), livemode: false, pending_webhooks: 1, request: null }) as unknown as Stripe.Event;
  const signed = (body: object) => { const payload = JSON.stringify(body); return new Request("http://localhost/api/webhooks/stripe/connect", { method: "POST", body: payload, headers: { "stripe-signature": signer.webhooks.generateTestHeaderString({ payload, secret: CONNECT_SECRET }), "content-type": "application/json" } }); };
  const pi = (id: string, amount: number) => ({ id, object: "payment_intent", status: "succeeded", amount, amount_received: amount, currency: "usd", latest_charge: `ch_${id}`, receipt_email: null, description: "Deposit", created: Math.floor(Date.now() / 1000) });
  beforeAll(async () => {
    a = await business("Stripe A");
    b = await business("Stripe B");
    await prisma.integration.create({ data: { businessId: a, provider: "STRIPE", status: "CONNECTED", accessToken: "acct_A", externalId: "acct_A", externalAccount: "Studio A", settings: { accountId: "acct_A", livemode: false } } });
    ({ POST } = await import("@/app/api/webhooks/stripe/connect/route"));
  });
  afterAll(async () => { await prisma.business.deleteMany({ where: { id: { in: [a, b] } } }); });

  it("a successful payment is recorded once against the person who paid, a refund updates it, and events for unknown accounts are ignored", async () => {
    const first = await handleStripeConnectEvent(evt("payment_intent.succeeded", "acct_A", pi("pi_1", 25_000)));
    expect(first).toMatchObject({ handled: "recorded", businessId: a });
    const again = await handleStripeConnectEvent(evt("payment_intent.succeeded", "acct_A", pi("pi_1", 25_000)));
    expect(again.handled).toBe("already_recorded");
    const payments = await prisma.payment.findMany({ where: { businessId: a }, include: { client: true } });
    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({ amountCents: 25_000, status: "PAID", method: "CARD", stripePaymentIntentId: "pi_1" });
    expect(payments[0].client).toMatchObject({ name: "Jane Payer", email: "jane.payer@example.test", relationship: "CUSTOMER" });
    expect(await prisma.notification.findFirst({ where: { businessId: a, title: "Payment received" } })).toBeTruthy();
    expect(await handleStripeConnectEvent(evt("charge.refunded", "acct_A", { id: "ch_pi_1", object: "charge", payment_intent: "pi_1" }))).toMatchObject({ handled: "refunded" });
    expect((await prisma.payment.findFirstOrThrow({ where: { businessId: a, stripePaymentIntentId: "pi_1" } })).status).toBe("REFUNDED");
    expect(await handleStripeConnectEvent(evt("payment_intent.succeeded", "acct_NOBODY", pi("pi_9", 100)))).toMatchObject({ handled: "unknown_account" });
    expect(await prisma.payment.count({ where: { businessId: b } })).toBe(0);
  });

  it("the signed route goes through the inbox; a forged signature is refused; deauthorization disconnects and tells the owner", async () => {
    const res = await POST(signed(evt("payment_intent.succeeded", "acct_A", pi("pi_2", 10_000))));
    expect(res.status).toBe(200);
    expect(await prisma.payment.count({ where: { businessId: a, stripePaymentIntentId: "pi_2" } })).toBe(1);
    const forged = await POST(new Request("http://localhost/api/webhooks/stripe/connect", { method: "POST", body: JSON.stringify(evt("payment_intent.succeeded", "acct_A", pi("pi_3", 1))), headers: { "stripe-signature": "t=1,v1=bad" } }));
    expect(forged.status).toBe(400);
    expect(await prisma.payment.count({ where: { businessId: a, stripePaymentIntentId: "pi_3" } })).toBe(0);
    const gone = await POST(signed(evt("account.application.deauthorized", "acct_A", { id: "ca_test", object: "application", name: "Daythread" })));
    expect(gone.status).toBe(200);
    expect((await prisma.integration.findUniqueOrThrow({ where: { businessId_provider: { businessId: a, provider: "STRIPE" } } })).status).toBe("NOT_CONNECTED");
    expect(await prisma.notification.findFirst({ where: { businessId: a, title: "Stripe disconnected" } })).toBeTruthy();
  });
});

describe("client folders (Google Drive)", () => {
  let a: string;
  let clientId: string;
  const created: string[] = [];
  beforeAll(async () => {
    a = await business("Drive A");
    clientId = (await prisma.client.create({ data: { businessId: a, name: "Folder / Client: Jane" } })).id;
    await prisma.integration.create({ data: { businessId: a, provider: "GOOGLE_DRIVE", status: "CONNECTED", accessToken: "g-at", refreshToken: "g-rt", tokenExpiresAt: future(), externalId: "owner@gmail.example.test", externalAccount: "owner@gmail.example.test" } });
    route = (url, call) => {
      if (url.startsWith("https://www.googleapis.com/drive/v3/files?") && call.method === "POST") { const name = (call.body as { name: string }).name; const id = `f-${name.replace(/\W+/g, "_")}`; created.push(name); return json({ id, name, mimeType: "application/vnd.google-apps.folder", webViewLink: `https://drive.google.com/drive/folders/${id}` }); }
      if (/\/drive\/v3\/files\/[^?]+\?fields=id,trashed/.test(url)) return json({ id: "x", trashed: false });
      if (url.includes("/drive/v3/files?q=")) return json({ files: [{ id: "doc1", name: "Contract.pdf", mimeType: "application/pdf", modifiedTime: new Date().toISOString(), webViewLink: "https://drive.google.com/file/d/doc1", size: "1024" }] });
      return json({});
    };
  });
  afterAll(async () => { await prisma.business.delete({ where: { id: a } }); });

  it("creates Daythread/Clients once, a folder per client once, stores only the reference, and lists the files", async () => {
    const first = await ensureClientFolder(a, clientId, "GOOGLE_DRIVE");
    expect(first.ok).toBe(true);
    expect(created).toEqual(["Daythread", "Clients", "Folder Client Jane"]);
    const client = await prisma.client.findUniqueOrThrow({ where: { id: clientId } });
    expect(client.externalFolders).toMatchObject({ GOOGLE_DRIVE: { id: "f-Folder_Client_Jane" } });
    const settings = (await prisma.integration.findUniqueOrThrow({ where: { businessId_provider: { businessId: a, provider: "GOOGLE_DRIVE" } } })).settings as { rootFolderId: string; clientsFolderId: string };
    expect(settings).toMatchObject({ rootFolderId: "f-Daythread", clientsFolderId: "f-Clients" });
    const second = await ensureClientFolder(a, clientId, "GOOGLE_DRIVE");
    expect(second.ok).toBe(true);
    expect(created).toHaveLength(3);
    const views = await clientFiles(a, clientId);
    expect(views).toHaveLength(1);
    expect(views[0].files[0]).toMatchObject({ name: "Contract.pdf", url: "https://drive.google.com/file/d/doc1" });
    // Another workspace's client is not reachable through this one.
    const other = await business("Drive B");
    expect((await ensureClientFolder(other, clientId, "GOOGLE_DRIVE")).ok).toBe(false);
    await prisma.business.delete({ where: { id: other } });
  });
});
