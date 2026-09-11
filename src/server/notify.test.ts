import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "@/lib/db";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }));

import { notifyBusiness, webPath, mobilePath, type NoticeTarget } from "@/server/notify";

/**
 * A notice has to point at something that exists on the surface the person is looking at.
 * The web dashboard and the phone app route the same record differently, which is why the
 * target is structured rather than a hand-written path.
 */
const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

/** Every route the phone app actually has, read from mobile/app at the time of writing. */
const MOBILE_ROUTES = ["/conversation/", "/booking/", "/person/", "/(tabs)/", "/settings/", "/bookings"];

describe("notification targets", () => {
  const ids: string[] = [];
  let biz: string;
  beforeAll(async () => {
    biz = (await prisma.business.create({ data: { name: "Notify Co", handle: `notify-${stamp()}` } })).id;
    ids.push(biz);
    vi.stubGlobal("fetch", async () => new Response("{}", { status: 200, headers: { "content-type": "application/json" } }));
  });
  afterAll(async () => { await prisma.business.deleteMany({ where: { id: { in: ids } } }); vi.unstubAllGlobals(); });

  const targets: NoticeTarget[] = [
    { kind: "conversation", id: "c1" },
    { kind: "booking", id: "b1" },
    { kind: "client", id: "cl1" },
    { kind: "payments" },
    { kind: "integrations" },
  ];

  it("every target resolves to a real route on both surfaces", () => {
    for (const t of targets) {
      const web = webPath(t);
      expect(web.startsWith("/")).toBe(true);
      // The web resolver is relative to /dashboard, and every one of these exists there.
      expect(["/inbox", "/bookings/", "/clients/", "/payments", "/settings"].some((p) => web.startsWith(p))).toBe(true);
      const mob = mobilePath(t);
      expect(MOBILE_ROUTES.some((p) => mob.startsWith(p))).toBe(true);
    }
  });

  it("the two surfaces genuinely differ, which is the bug this replaced", () => {
    // A conversation is a query parameter on the web and a screen on the phone; a person is
    // /clients on the web and /person on the phone. One shared string could not serve both.
    expect(webPath({ kind: "conversation", id: "x" })).toBe("/inbox?c=x");
    expect(mobilePath({ kind: "conversation", id: "x" })).toBe("/conversation/x");
    expect(webPath({ kind: "client", id: "x" })).toBe("/clients/x");
    expect(mobilePath({ kind: "client", id: "x" })).toBe("/person/x");
    expect(webPath({ kind: "booking", id: "x" })).toBe("/bookings/x");
    expect(mobilePath({ kind: "booking", id: "x" })).toBe("/booking/x");
  });

  it("a notice that names a record is stored with somewhere to go", async () => {
    await notifyBusiness(biz, { kind: "lead", title: "Jane wrote to you", body: "New inquiry on email.", target: { kind: "conversation", id: "conv-123" } });
    const row = await prisma.notification.findFirstOrThrow({ where: { businessId: biz }, orderBy: { createdAt: "desc" } });
    expect(row.path).toBe("/inbox?c=conv-123");
    expect(row.title).toBe("Jane wrote to you");
  });

  it("a notice with nothing to open stores no path rather than a broken one", async () => {
    await notifyBusiness(biz, { kind: "agent", title: "Nothing to open", body: "Just so you know." });
    const row = await prisma.notification.findFirstOrThrow({ where: { businessId: biz, title: "Nothing to open" } });
    expect(row.path).toBeNull();
  });
});
