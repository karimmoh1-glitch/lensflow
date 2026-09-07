import { describe, it, expect, afterAll, vi } from "vitest";
import { prisma } from "@/lib/db";

/**
 * The connection *start* points refuse a full plan before anything leaves the server:
 * Google's consent screen is never opened, iCloud is never contacted, Twilio never asked.
 * These are the same server actions the Integrations page's buttons call — and the same
 * ones a script would call to bypass the page.
 */
const redirects: string[] = [];
vi.mock("next/navigation", () => ({ redirect: (url: string) => { redirects.push(url); throw new Error(`NEXT_REDIRECT:${url}`); } }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }));
const network = vi.fn(async () => { throw new Error("network must not be touched"); });

describe("connection start on a full plan", () => {
  const ids: string[] = [];
  afterAll(async () => {
    await prisma.business.deleteMany({ where: { id: { in: ids } } });
    vi.unstubAllGlobals();
  });
  async function fullFree() {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const b = await prisma.business.create({ data: { name: "Full Free", handle: `full-free-${stamp}`, planTier: "FREE" } });
    const u = await prisma.user.create({ data: { name: "O", email: `full-free-${stamp}@example.com`, passwordHash: "x" } });
    await prisma.orgMembership.create({ data: { userId: u.id, businessId: b.id, role: "OWNER" } });
    await prisma.integration.createMany({ data: [{ businessId: b.id, provider: "EMAIL", status: "CONNECTED", refreshToken: "r" }, { businessId: b.id, provider: "GOOGLE_CALENDAR", status: "CONNECTED", refreshToken: "r" }] });
    ids.push(b.id);
    return { businessId: b.id, session: { userId: u.id, activeBusinessId: b.id } };
  }

  it("Google Calendar: sent straight back with connect_error=limit, never to Google", async () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "id");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "secret");
    vi.stubGlobal("fetch", network);
    const { connectGoogle } = await import("./googleAuth");
    const { session } = await fullFree();
    // The plan's two slots are Gmail and Google Calendar themselves: reconnecting either is fine…
    await prisma.integration.updateMany({ where: { businessId: session.activeBusinessId, provider: "GOOGLE_CALENDAR" }, data: { status: "NOT_CONNECTED", refreshToken: null } });
    await prisma.integration.create({ data: { businessId: session.activeBusinessId, provider: "APPLE_CALENDAR", status: "CONNECTED", accessToken: "abcd-efgh-ijkl-mnop" } });
    redirects.length = 0;
    await expect(connectGoogle("calendar", session)).rejects.toThrow(/NEXT_REDIRECT/);
    expect(redirects[0]).toBe("/dashboard/settings?tab=connections&connect_error=limit&provider=GOOGLE_CALENDAR");
    expect(network).not.toHaveBeenCalled();
    // …while Gmail, which already holds a slot, may reconnect and is sent to Google.
    redirects.length = 0;
    await expect(connectGoogle("gmail", session)).rejects.toThrow(/NEXT_REDIRECT/);
    expect(redirects[0]).toMatch(/^https:\/\/accounts\.google\.com\//);
  });

  it("Apple Calendar: refused with the limit message before iCloud is contacted", async () => {
    vi.stubGlobal("fetch", network);
    const { connectAppleCalendar } = await import("./connect");
    const { session } = await fullFree();
    const r = await connectAppleCalendar("owner@icloud.com", "abcd-efgh-ijkl-mnop", session);
    expect(r.error).toMatch(/^Connection limit reached\. Free includes 2 connections\. Upgrade to Pro/);
    expect(network).not.toHaveBeenCalled();
    expect(await prisma.integration.count({ where: { businessId: session.activeBusinessId, provider: "APPLE_CALENDAR" } })).toBe(0);
  });

  it("the legacy toggle can no longer fabricate a connection", async () => {
    const { toggleIntegration } = await import("./integrations");
    // toggleIntegration reads the cookie session; with none it must refuse, never write.
    await expect(toggleIntegration("INSTAGRAM", true)).rejects.toThrow();
  });
});
