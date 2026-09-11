import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "@/lib/db";
import { createSessionToken } from "@/lib/auth";

const cookie = { value: "" };
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "198.51.100.31" }),
  cookies: async () => ({ get: (name: string) => (name === "lf_session" && cookie.value ? { value: cookie.value } : undefined), set: () => {}, delete: () => {} }),
}));

import { GET } from "@/app/api/inbox/events/route";

/**
 * The inbox stream reports how busy a workspace's inbox is, live. A CLIENT holds a real
 * login for their own portal in that same workspace, so a session alone is not enough.
 */
const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

describe("inbox stream authorization", () => {
  const ids: string[] = [];
  let ownerToken: string;
  let clientToken: string;

  beforeAll(async () => {
    const s = stamp();
    const business = await prisma.business.create({ data: { name: "Stream Co", handle: `stream-${s}`, timezone: "America/Chicago" } });
    ids.push(business.id);
    const mk = async (role: "OWNER" | "CLIENT") => {
      const user = await prisma.user.create({ data: { email: `${role.toLowerCase()}-${s}@example.test`, name: role, passwordHash: "x" } });
      await prisma.orgMembership.create({ data: { userId: user.id, businessId: business.id, role } });
      return createSessionToken({ userId: user.id, activeBusinessId: business.id });
    };
    ownerToken = await mk("OWNER");
    clientToken = await mk("CLIENT");
  });
  afterAll(async () => { await prisma.business.deleteMany({ where: { id: { in: ids } } }); });

  const call = async (token: string) => {
    cookie.value = token;
    const ac = new AbortController();
    const res = await GET(new Request("http://localhost/api/inbox/events?since=0", { signal: ac.signal }));
    ac.abort();
    await res.body?.cancel().catch(() => {});
    return res.status;
  };

  it("a client portal login cannot open the workspace inbox stream", async () => {
    expect(await call(clientToken)).toBe(401);
  });

  it("no session at all is refused", async () => {
    expect(await call("")).toBe(401);
  });

  it("an owner still gets the stream", async () => {
    expect(await call(ownerToken)).toBe(200);
  });
});
