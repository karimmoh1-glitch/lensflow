import { describe, it, expect, afterAll, vi } from "vitest";
import { prisma } from "@/lib/db";

/**
 * The connection *start* points refuse a full plan before anything leaves the server:
 * Google's consent screen is never opened. These are the same server actions the Channels
 * page's buttons call — and the same ones a script would call to bypass the page.
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
  async function fullFree(connected: Array<"EMAIL" | "INSTAGRAM" | "WHATSAPP" | "SMS">) {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const b = await prisma.business.create({ data: { name: "Full Free", handle: `full-free-${stamp}`, planTier: "FREE" } });
    const u = await prisma.user.create({ data: { name: "O", email: `full-free-${stamp}@example.com`, passwordHash: "x" } });
    await prisma.orgMembership.create({ data: { userId: u.id, businessId: b.id, role: "OWNER" } });
    await prisma.integration.createMany({ data: connected.map((provider) => ({ businessId: b.id, provider, status: "CONNECTED" as const, refreshToken: "r" })) });
    ids.push(b.id);
    return { businessId: b.id, session: { userId: u.id, activeBusinessId: b.id } };
  }

  it("Gmail: sent straight back with connect_error=limit, never to Google — while a reconnect of a held slot proceeds", async () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "id");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "secret");
    vi.stubGlobal("fetch", network);
    const { connectGoogle } = await import("./googleAuth");
    // Both Free slots taken by other channels: Gmail needs a slot and is refused.
    const full = await fullFree(["INSTAGRAM", "WHATSAPP"]);
    redirects.length = 0;
    await expect(connectGoogle("gmail", full.session)).rejects.toThrow(/NEXT_REDIRECT/);
    expect(redirects[0]).toBe("/dashboard/settings?tab=channels&connect_error=limit&provider=EMAIL");
    expect(network).not.toHaveBeenCalled();
    // Gmail already holds one of the two slots: reconnecting is fine and goes to Google.
    const holder = await fullFree(["EMAIL", "INSTAGRAM"]);
    redirects.length = 0;
    await expect(connectGoogle("gmail", holder.session)).rejects.toThrow(/NEXT_REDIRECT/);
    expect(redirects[0]).toMatch(/^https:\/\/accounts\.google\.com\//);
    expect(network).not.toHaveBeenCalled();
  });

  it("the legacy toggle can no longer fabricate a connection", async () => {
    const { toggleIntegration } = await import("./integrations");
    // toggleIntegration reads the cookie session; with none it must refuse, never write.
    await expect(toggleIntegration("INSTAGRAM", true)).rejects.toThrow();
  });
});
