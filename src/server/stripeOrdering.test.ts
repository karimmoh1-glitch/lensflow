import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import Stripe from "stripe";
import { prisma } from "@/lib/db";
import { effectivePlan } from "@/lib/billing";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
const remote = vi.hoisted(() => ({ subscriptions: new Map<string, unknown>(), charges: new Map<string, unknown>() }));
vi.mock("@/lib/payments", async () => {
  const { default: StripeSdk } = await import("stripe");
  const client = new StripeSdk("sk_test_dummy", { apiVersion: undefined as unknown as never });
  client.subscriptions.retrieve = (async (id: string) => {
    const sub = remote.subscriptions.get(id);
    if (!sub) throw new Error(`No such subscription: ${id}`);
    return sub;
  }) as never;
  client.charges.retrieve = (async (id: string) => {
    const ch = remote.charges.get(id);
    if (!ch) throw new Error(`No such charge: ${id}`);
    return ch;
  }) as never;
  return { stripe: client, stripeIsLive: true };
});

/**
 * What could grant paid access that was never paid for, or take it from someone who pays:
 * events arriving out of order or replayed from the retry queue, an event about a
 * subscription that is no longer the live one, a Connect event on the platform endpoint,
 * a test-mode event on a live deployment, and a chargeback nobody acts on.
 */
const WEBHOOK_SECRET = "whsec_test_daythread";
const signer = new Stripe("sk_test_dummy", { apiVersion: undefined as unknown as Stripe.LatestApiVersion });
let POST: (req: Request) => Promise<Response>;
let seq = 0;

function signed(body: object): Request {
  const payload = JSON.stringify(body);
  const header = signer.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
  return new Request("http://localhost/api/webhooks/stripe", { method: "POST", body: payload, headers: { "stripe-signature": header, "content-type": "application/json" } });
}
const evt = (type: string, object: object, extra: Record<string, unknown> = {}) => ({ id: `evt_order_${Date.now()}_${++seq}`, object: "event", type, data: { object }, api_version: "2024-06-20", created: Math.floor(Date.now() / 1000), livemode: false, pending_webhooks: 1, request: null, ...extra });
const price = (planKey: "PRO" | "BUSINESS") => ({ id: `price_${planKey}`, object: "price", lookup_key: `daythread_${planKey.toLowerCase()}_monthly`, unit_amount: planKey === "PRO" ? 2000 : 8000, currency: "usd", recurring: { interval: "month" }, product: `prod_${planKey}` });
const sub = (o: { id: string; businessId: string; customer: string; status: string; planKey?: "PRO" | "BUSINESS" }) => ({
  id: o.id, object: "subscription", customer: o.customer, status: o.status, cancel_at_period_end: false,
  current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400, metadata: { businessId: o.businessId, planTier: o.planKey ?? "PRO" },
  items: { object: "list", data: [{ id: "si_1", object: "subscription_item", price: price(o.planKey ?? "PRO") }] },
});

describe("Stripe events that could be replayed, reordered or misdirected", () => {
  const ids: string[] = [];
  const workspace = async () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const b = await prisma.business.create({ data: { name: `Order ${stamp}`, handle: `order-${stamp}`, stripeCustomerId: `cus_${stamp}` } });
    ids.push(b.id);
    return b;
  };
  beforeAll(async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_dummy");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", WEBHOOK_SECRET);
    ({ POST } = await import("@/app/api/webhooks/stripe/route"));
  });
  afterAll(async () => {
    await prisma.webhookEvent.deleteMany({ where: { provider: "stripe", eventId: { startsWith: "evt_order_" } } });
    await prisma.business.deleteMany({ where: { id: { in: ids } } });
    vi.unstubAllEnvs();
  });

  it("an old 'active' snapshot arriving after the cancellation cannot resurrect the plan", async () => {
    const b = await workspace();
    const active = sub({ id: `sub_${b.id}`, businessId: b.id, customer: b.stripeCustomerId!, status: "active" });
    remote.subscriptions.set(active.id, active);
    await POST(signed(evt("customer.subscription.created", active)));
    expect((await prisma.business.findUniqueOrThrow({ where: { id: b.id } })).planTier).toBe("PRO");

    const canceled = { ...active, status: "canceled" };
    remote.subscriptions.set(active.id, canceled);
    await POST(signed(evt("customer.subscription.deleted", canceled)));
    expect(effectivePlan(await prisma.business.findUniqueOrThrow({ where: { id: b.id } }))).toBe("FREE");

    // Stripe redelivers (or the daily run replays) the older "active" event. Stripe's answer
    // to "what is this subscription now" is still "canceled", and that is what applies.
    const r = await POST(signed(evt("customer.subscription.updated", active)));
    expect(r.status).toBe(200);
    const after = await prisma.business.findUniqueOrThrow({ where: { id: b.id } });
    expect(after.billingStatus).toBe("CANCELED");
    expect(effectivePlan(after)).toBe("FREE");
  });

  it("an event about a superseded subscription does not touch the live one", async () => {
    const b = await workspace();
    const live = sub({ id: `sub_live_${b.id}`, businessId: b.id, customer: b.stripeCustomerId!, status: "active", planKey: "BUSINESS" });
    remote.subscriptions.set(live.id, live);
    await POST(signed(evt("customer.subscription.created", live)));
    // An abandoned first checkout expires a day later.
    const stale = sub({ id: `sub_old_${b.id}`, businessId: b.id, customer: b.stripeCustomerId!, status: "incomplete_expired" });
    remote.subscriptions.set(stale.id, stale);
    await POST(signed(evt("customer.subscription.updated", stale)));
    const after = await prisma.business.findUniqueOrThrow({ where: { id: b.id } });
    expect(after.stripeSubscriptionId).toBe(live.id);
    expect(after.planTier).toBe("BUSINESS");
    expect(after.billingStatus).toBe("ACTIVE");
  });

  it("a subscription Stripe no longer knows is not applied from the snapshot", async () => {
    const b = await workspace();
    const ghost = sub({ id: `sub_ghost_${b.id}`, businessId: b.id, customer: b.stripeCustomerId!, status: "active" });
    // Deliberately not registered with the mocked API: the read fails, the delivery is
    // marked failed for retry, and nothing is granted.
    const r = await POST(signed(evt("customer.subscription.created", ghost)));
    expect(r.status).toBe(500);
    expect((await prisma.business.findUniqueOrThrow({ where: { id: b.id } })).planTier).toBe("FREE");
  });

  it("a Connect-scoped event on the platform endpoint is ignored", async () => {
    const b = await workspace();
    const s = sub({ id: `sub_connect_${b.id}`, businessId: b.id, customer: b.stripeCustomerId!, status: "active", planKey: "BUSINESS" });
    remote.subscriptions.set(s.id, s);
    const r = await POST(signed(evt("customer.subscription.created", s, { account: "acct_someone_elses" })));
    expect(await r.json()).toMatchObject({ ignored: "connect_event" });
    expect((await prisma.business.findUniqueOrThrow({ where: { id: b.id } })).planTier).toBe("FREE");
  });

  it("an event whose mode does not match the deployment's key is refused", async () => {
    const b = await workspace();
    const s = sub({ id: `sub_live_mode_${b.id}`, businessId: b.id, customer: b.stripeCustomerId!, status: "active" });
    remote.subscriptions.set(s.id, s);
    const r = await POST(signed(evt("customer.subscription.created", s, { livemode: true })));
    expect(r.status).toBe(400);
    expect((await prisma.business.findUniqueOrThrow({ where: { id: b.id } })).planTier).toBe("FREE");
  });

  it("a chargeback withdraws paid access and leaves a founder-visible record", async () => {
    const b = await workspace();
    const s = sub({ id: `sub_disp_${b.id}`, businessId: b.id, customer: b.stripeCustomerId!, status: "active" });
    remote.subscriptions.set(s.id, s);
    await POST(signed(evt("customer.subscription.created", s)));
    const chargeId = `ch_${b.id}`;
    remote.charges.set(chargeId, { id: chargeId, object: "charge", customer: b.stripeCustomerId });
    const r = await POST(signed(evt("charge.dispute.created", { id: `dp_${b.id}`, object: "dispute", charge: chargeId, amount: 2000, reason: "fraudulent" })));
    expect(await r.json()).toMatchObject({ handled: true });
    const after = await prisma.business.findUniqueOrThrow({ where: { id: b.id } });
    expect(after.billingStatus).toBe("UNPAID");
    expect(effectivePlan(after)).toBe("FREE");
    expect(await prisma.opsEvent.count({ where: { businessId: b.id, area: "billing", message: { contains: "disputed" } } })).toBe(1);
    // A dispute for a customer nobody here owns changes nothing and names no tenant.
    remote.charges.set("ch_stranger", { id: "ch_stranger", object: "charge", customer: "cus_stranger" });
    const stranger = await POST(signed(evt("charge.dispute.created", { id: "dp_stranger", object: "dispute", charge: "ch_stranger", amount: 100, reason: "general" })));
    expect(await stranger.json()).toMatchObject({ handled: false });
  });

  it("a delivery that failed is retried once, not twice, when the daily run and a redelivery race", async () => {
    const { runWebhook } = await import("@/server/webhookInbox");
    const eventId = `evt_order_race_${Date.now()}`;
    let runs = 0;
    const handler = async () => { runs++; await new Promise((r) => setTimeout(r, 50)); };
    await runWebhook("stripe", eventId, { x: 1 }, async () => { throw new Error("first attempt fails"); });
    expect((await prisma.webhookEvent.findUniqueOrThrow({ where: { provider_eventId: { provider: "stripe", eventId } } })).status).toBe("failed");
    const [a, b] = await Promise.all([runWebhook("stripe", eventId, { x: 1 }, handler), runWebhook("stripe", eventId, { x: 1 }, handler)]);
    expect([a.status, b.status].sort()).toEqual(["duplicate", "processed"]);
    expect(runs).toBe(1);
  });
});
