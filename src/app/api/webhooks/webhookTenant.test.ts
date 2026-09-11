import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createHmac } from "crypto";
import { prisma } from "@/lib/db";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { recipientHandle } from "@/lib/inboundEmail";
import { handleStripeConnectEvent } from "@/server/stripeConnectEvents";
import type Stripe from "stripe";

const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

/**
 * A webhook decides which workspace a message, a booking or a payment belongs to. Every one
 * of these is a case where the wrong answer put somebody else's data in a tenant's account.
 */
describe("inbound email picks the workspace from our own domain, not from to[0]", () => {
  const DOMAIN = "inbound.daythread.org";

  it("ignores addresses on other domains, whatever their position", () => {
    // The attack: a mail addressed to the victim's handle at any domain, with our address
    // second, used to be ingested straight into the victim's inbox.
    expect(recipientHandle(["victim-handle@gmail.com", `attacker@${DOMAIN}`], DOMAIN)).toBe("attacker");
    expect(recipientHandle([`acme@${DOMAIN}`, "someone@else.com"], DOMAIN)).toBe("acme");
    expect(recipientHandle(["acme@gmail.com"], DOMAIN)).toBeNull();
    expect(recipientHandle(["acme@notours.example"], DOMAIN)).toBeNull();
  });

  it("routes nothing at all when the inbound domain is not configured", () => {
    expect(recipientHandle([`acme@${DOMAIN}`], undefined)).toBeNull();
    expect(recipientHandle([`acme@${DOMAIN}`], "")).toBeNull();
  });

  it("handles the shapes a mail header actually arrives in", () => {
    expect(recipientHandle([`Acme Studio <acme@${DOMAIN}>`], DOMAIN)).toBe("acme");
    expect(recipientHandle(`acme@${DOMAIN}`, DOMAIN)).toBe("acme");
    expect(recipientHandle([`ACME@${DOMAIN.toUpperCase()}`], DOMAIN)).toBe("acme");
    expect(recipientHandle([], DOMAIN)).toBeNull();
    expect(recipientHandle(undefined, DOMAIN)).toBeNull();
    expect(recipientHandle(["not-an-address"], DOMAIN)).toBeNull();
    expect(recipientHandle([`@${DOMAIN}`], DOMAIN)).toBeNull();
  });
});

describe("an Instagram envelope must be signed by the Instagram app", () => {
  const META = "meta_secret_for_whatsapp";
  const IG = "instagram_secret_for_dms";
  let POST: (req: Request) => Promise<Response>;
  const sign = (body: string, secret: string) => "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
  const post = (body: object, secret: string) => {
    const raw = JSON.stringify(body);
    return POST(new Request("http://localhost/api/webhooks/meta", { method: "POST", body: raw, headers: { "x-hub-signature-256": sign(raw, secret), "content-type": "application/json" } }));
  };

  beforeAll(async () => {
    vi.stubEnv("META_APP_SECRET", META);
    vi.stubEnv("INSTAGRAM_APP_SECRET", IG);
    vi.stubEnv("META_WEBHOOK_VERIFY_TOKEN", "verify");
    ({ POST } = await import("./meta/route"));
    await prisma.webhookEvent.deleteMany({ where: { provider: "meta" } });
  });
  afterAll(async () => { await prisma.webhookEvent.deleteMany({ where: { provider: "meta" } }); vi.unstubAllEnvs(); });

  const igEnvelope = () => ({ object: "instagram", entry: [{ id: `ig_${stamp()}`, time: Date.now(), messaging: [] }] });
  const waEnvelope = () => ({ object: "whatsapp_business_account", entry: [{ id: `wa_${stamp()}`, changes: [] }] });

  it("refuses an Instagram envelope signed with the WhatsApp app's secret", async () => {
    const res = await post(igEnvelope(), META);
    expect(res.status).toBe(401);
  });

  it("refuses a WhatsApp envelope signed with the Instagram app's secret", async () => {
    const res = await post(waEnvelope(), IG);
    expect(res.status).toBe(401);
  });

  it("accepts each product signed by its own app, so the binding is not simply rejecting everything", async () => {
    expect((await post(igEnvelope(), IG)).status).toBe(200);
    expect((await post(waEnvelope(), META)).status).toBe(200);
  });
});

describe("Stripe Connect events reach the workspace that still holds the account", () => {
  const ids: string[] = [];
  const account = `acct_${stamp()}`;

  beforeAll(() => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_dummy");
  });
  afterAll(async () => { await prisma.business.deleteMany({ where: { id: { in: ids } } }); vi.unstubAllEnvs(); });

  const evt = (type: string, acct: string, object: object) =>
    ({ id: `evt_${stamp()}`, object: "event", type, account: acct, data: { object }, api_version: "2024-06-20", created: Math.floor(Date.now() / 1000), livemode: false, pending_webhooks: 1, request: null }) as unknown as Stripe.Event;

  it("a stale disconnected row does not swallow the events of the workspace that connected next", async () => {
    const older = await prisma.business.create({ data: { name: "Former", handle: `former-${stamp()}` } });
    const current = await prisma.business.create({ data: { name: "Current", handle: `current-${stamp()}` } });
    ids.push(older.id, current.id);
    // The old workspace disconnected. Its row keeps the history but must release the account.
    await prisma.integration.create({ data: { businessId: older.id, provider: "STRIPE", status: "NOT_CONNECTED", externalId: null, externalAccount: "Former" } });
    await prisma.integration.create({ data: { businessId: current.id, provider: "STRIPE", status: "CONNECTED", accessToken: account, externalId: account, externalAccount: "Current" } });

    const r = await handleStripeConnectEvent(evt("payment_intent.succeeded", account, { id: `pi_${stamp()}`, object: "payment_intent", status: "succeeded", amount: 5000, amount_received: 5000, currency: "usd", latest_charge: null, receipt_email: "payer@example.test", created: Math.floor(Date.now() / 1000) }));
    expect(r).toMatchObject({ businessId: current.id });
    expect(await prisma.payment.count({ where: { businessId: current.id } })).toBe(1);
    expect(await prisma.payment.count({ where: { businessId: older.id } })).toBe(0);
  });

  it("deauthorization releases the account id, so it can be connected somewhere else cleanly", async () => {
    const biz = await prisma.business.create({ data: { name: "Leaving", handle: `leaving-${stamp()}` } });
    ids.push(biz.id);
    const acct = `acct_${stamp()}`;
    await prisma.integration.create({ data: { businessId: biz.id, provider: "STRIPE", status: "CONNECTED", accessToken: acct, externalId: acct, externalAccount: "Leaving" } });
    await handleStripeConnectEvent(evt("account.application.deauthorized", acct, { id: "ca_x", object: "application" }));
    const row = await prisma.integration.findUniqueOrThrow({ where: { businessId_provider: { businessId: biz.id, provider: "STRIPE" } } });
    expect(row.status).toBe("NOT_CONNECTED");
    expect(row.externalId).toBeNull();
  });
});
