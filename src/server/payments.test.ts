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
    expect(v.totals).toEqual({ collectedCents: 35_000, pendingCents: 5_000, refundedCents: 7_500, failed: 1, count: 5 });
    expect(v.rows).toHaveLength(5);
    expect(v.hasMore).toBe(false);
  });

  it("never reads another workspace's money, on rows or on totals", async () => {
    const v = await listPayments(a);
    expect(v.rows.some((r) => r.amountCents === 999_999)).toBe(false);
    expect(v.totals.collectedCents).toBe(35_000);
    const other = await listPayments(b);
    expect(other.totals.collectedCents).toBe(999_999);
    expect(other.rows).toHaveLength(1);
    expect(other.rows[0].client?.name).toBe("Bob Payer");
  });

  it("filters by status without changing the workspace totals", async () => {
    const paid = await listPayments(a, { status: "PAID" });
    expect(paid.rows).toHaveLength(2);
    expect(paid.rows.every((r) => r.status === "PAID")).toBe(true);
    expect(paid.totals.count).toBe(5); // the summary is the whole workspace, not the page
  });

  it("filters by client, scoped to the workspace", async () => {
    const mine = await listPayments(a, { clientId: clientA });
    expect(mine.rows).toHaveLength(5);
    // A client id from another workspace yields nothing rather than that workspace's rows.
    const crossed = await listPayments(a, { clientId: clientB });
    expect(crossed.rows).toHaveLength(0);
    expect(crossed.totals.collectedCents).toBe(0);
  });

  it("pages without losing the summary", async () => {
    const page = await listPayments(a, { take: 2 });
    expect(page.rows).toHaveLength(2);
    expect(page.hasMore).toBe(true);
    expect(page.totals.count).toBe(5);
  });
});
