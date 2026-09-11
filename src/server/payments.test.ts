import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "@/lib/db";
import { listPayments } from "@/server/payments";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

/** The payments ledger: totals that match the records, and money that never crosses tenants. */
const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

describe("payments ledger", () => {
  const ids: string[] = [];
  let a: string;
  let b: string;
  let clientA: string;
  let clientB: string;

  beforeAll(async () => {
    a = (await prisma.business.create({ data: { name: "Pay A", handle: `pay-a-${stamp()}` } })).id;
    b = (await prisma.business.create({ data: { name: "Pay B", handle: `pay-b-${stamp()}` } })).id;
    ids.push(a, b);
    clientA = (await prisma.client.create({ data: { businessId: a, name: "Ada Payer" } })).id;
    clientB = (await prisma.client.create({ data: { businessId: b, name: "Bob Payer" } })).id;
    const mk = (businessId: string, clientId: string, amountCents: number, status: "PAID" | "AWAITING_CONFIRMATION" | "REFUNDED" | "FAILED") =>
      prisma.payment.create({ data: { businessId, clientId, amountCents, status, method: "CARD", purpose: "FULL", confirmedAt: status === "PAID" ? new Date() : null } });
    await mk(a, clientA, 25_000, "PAID");
    await mk(a, clientA, 10_000, "PAID");
    await mk(a, clientA, 5_000, "AWAITING_CONFIRMATION");
    await mk(a, clientA, 7_500, "REFUNDED");
    await mk(a, clientA, 1_000, "FAILED");
    await mk(b, clientB, 999_999, "PAID");
  });
  afterAll(async () => { await prisma.business.deleteMany({ where: { id: { in: ids } } }); });

  it("totals reflect every record in the workspace, and each status is counted once", async () => {
    const v = await listPayments(a);
    expect(v.totals).toEqual([{ currency: "usd", collectedCents: 35_000, pendingCents: 5_000, refundedCents: 7_500, failed: 1, count: 5 }]);
    expect(v.count).toBe(5);
    expect(v.rows).toHaveLength(5);
    expect(v.hasMore).toBe(false);
    // Only the statuses that exist are offered as filters.
    expect(v.statuses).toEqual(["PAID", "AWAITING_CONFIRMATION", "REFUNDED", "FAILED"]);
  });

  it("keeps each currency separate rather than adding euros to dollars", async () => {
    const euros = await prisma.business.create({ data: { name: "Euro Co", handle: `eur-${stamp()}` } });
    ids.push(euros.id);
    const c = await prisma.client.create({ data: { businessId: euros.id, name: "Élodie" } });
    await prisma.payment.create({ data: { businessId: euros.id, clientId: c.id, amountCents: 10_000, currency: "eur", status: "PAID", method: "CARD", purpose: "FULL", confirmedAt: new Date() } });
    await prisma.payment.create({ data: { businessId: euros.id, clientId: c.id, amountCents: 5_000, currency: "eur", status: "PAID", method: "CARD", purpose: "FULL", confirmedAt: new Date() } });
    await prisma.payment.create({ data: { businessId: euros.id, clientId: c.id, amountCents: 2_500, currency: "usd", status: "PAID", method: "CARD", purpose: "FULL", confirmedAt: new Date() } });
    const v = await listPayments(euros.id);
    expect(v.count).toBe(3);
    expect(v.totals[0]).toMatchObject({ currency: "eur", collectedCents: 15_000, count: 2 });
    expect(v.totals[1]).toMatchObject({ currency: "usd", collectedCents: 2_500, count: 1 });
    // Never one merged number.
    expect(v.totals.reduce((n, t) => n + t.collectedCents, 0)).toBe(17_500);
    expect(v.totals).toHaveLength(2);
  });

  it("never reads another workspace's money, on rows or on totals", async () => {
    const v = await listPayments(a);
    expect(v.rows.some((r) => r.amountCents === 999_999)).toBe(false);
    expect(v.totals[0].collectedCents).toBe(35_000);
    const other = await listPayments(b);
    expect(other.totals[0].collectedCents).toBe(999_999);
    expect(other.rows).toHaveLength(1);
    expect(other.rows[0].client?.name).toBe("Bob Payer");
  });

  it("filters by status without changing the workspace totals", async () => {
    const paid = await listPayments(a, { status: "PAID" });
    expect(paid.rows).toHaveLength(2);
    expect(paid.rows.every((r) => r.status === "PAID")).toBe(true);
    expect(paid.count).toBe(5); // the summary is the whole workspace, not the page
  });

  it("filters by client, scoped to the workspace", async () => {
    const mine = await listPayments(a, { clientId: clientA });
    expect(mine.rows).toHaveLength(5);
    // A client id from another workspace yields nothing rather than that workspace's rows.
    const crossed = await listPayments(a, { clientId: clientB });
    expect(crossed.rows).toHaveLength(0);
    expect(crossed.totals).toHaveLength(0);
    expect(crossed.count).toBe(0);
  });

  it("a legacy DEMO integration row is not a connected Stripe account", async () => {
    // The seed leaves DEMO rows behind. Reading one as connected would tell a workspace its
    // money was being recorded from Stripe when nothing is.
    const demo = await prisma.business.create({ data: { name: "Demo Co", handle: `demo-${stamp()}` } });
    ids.push(demo.id);
    await prisma.integration.create({ data: { businessId: demo.id, provider: "STRIPE", status: "DEMO" } });
    const row = await prisma.integration.findUniqueOrThrow({ where: { businessId_provider: { businessId: demo.id, provider: "STRIPE" } } });
    const connected = row.status !== "NOT_CONNECTED" && row.status !== "DEMO";
    expect(connected).toBe(false);
    expect((await listPayments(demo.id)).count).toBe(0);
  });

  it("pages without losing the summary", async () => {
    const page = await listPayments(a, { take: 2 });
    expect(page.rows).toHaveLength(2);
    expect(page.hasMore).toBe(true);
    expect(page.count).toBe(5);
  });
});
