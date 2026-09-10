import { describe, it, expect, afterAll, vi } from "vitest";
import { prisma } from "@/lib/db";

/**
 * The Meta connection *start* points, called the way a script would call them — directly,
 * with no page in front. A full plan must come straight back with the limit, and Meta must
 * never be contacted; a deployment with no Meta configuration must refuse outright rather
 * than build an authorization URL out of undefined values.
 *
 * These are the same server actions the Integrations page's buttons call.
 */
const redirects: string[] = [];
vi.mock("next/navigation", () => ({ redirect: (url: string) => { redirects.push(url); throw new Error(`NEXT_REDIRECT:${url}`); } }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }));
const network = vi.fn(async () => {
  throw new Error("network must not be touched");
});

const SECRET = "0123456789abcdef0123456789abcdef";
function configureMeta() {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://daythread.org");
  // These tests are about the plan gate; the release-stage gate (invite-only Instagram,
  // coming-soon WhatsApp) is covered in integrationsSystem.test.ts and is opened here.
  vi.stubEnv("INTEGRATION_INSTAGRAM_MODE", "open");
  vi.stubEnv("INTEGRATION_WHATSAPP_MODE", "open");
  vi.stubEnv("INSTAGRAM_APP_ID", "1111111111111111");
  vi.stubEnv("INSTAGRAM_APP_SECRET", SECRET);
  vi.stubEnv("META_APP_ID", "2222222222222222");
  vi.stubEnv("META_APP_SECRET", SECRET);
  vi.stubEnv("WHATSAPP_CONFIG_ID", "3333333333333333");
  vi.stubEnv("META_WEBHOOK_VERIFY_TOKEN", "a-long-random-verify-token");
}

describe("Meta connection start", () => {
  const ids: string[] = [];
  afterAll(async () => {
    await prisma.business.deleteMany({ where: { id: { in: ids } } });
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  async function workspace(planTier: "FREE" | "PRO" | "BUSINESS", connected: Array<"EMAIL" | "GOOGLE_CALENDAR" | "SMS" | "APPLE_CALENDAR"> = []) {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const b = await prisma.business.create({ data: { name: "Meta Quota", handle: `meta-quota-${stamp}`, planTier, billingStatus: planTier === "FREE" ? null : "ACTIVE" } });
    const u = await prisma.user.create({ data: { name: "O", email: `meta-quota-${stamp}@example.com`, passwordHash: "x" } });
    await prisma.orgMembership.create({ data: { userId: u.id, businessId: b.id, role: "OWNER" } });
    if (connected.length) await prisma.integration.createMany({ data: connected.map((provider) => ({ businessId: b.id, provider, status: "CONNECTED" as const, refreshToken: "r" })) });
    ids.push(b.id);
    return { businessId: b.id, session: { userId: u.id, activeBusinessId: b.id } };
  }

  it("Free with both slots used: Instagram is refused before Meta is contacted", async () => {
    configureMeta();
    vi.stubGlobal("fetch", network);
    const { connectInstagram } = await import("./connect");
    const { session } = await workspace("FREE", ["EMAIL", "GOOGLE_CALENDAR"]);
    redirects.length = 0;
    await expect(connectInstagram(session)).rejects.toThrow(/NEXT_REDIRECT/);
    expect(redirects[0]).toBe("/dashboard/settings?tab=connections&connect_error=limit&provider=INSTAGRAM");
    expect(network).not.toHaveBeenCalled();
    expect(await prisma.integration.count({ where: { businessId: session.activeBusinessId, provider: "INSTAGRAM" } })).toBe(0);
  });

  it("Free with both slots used: WhatsApp is refused the same way", async () => {
    configureMeta();
    vi.stubGlobal("fetch", network);
    const { connectWhatsApp } = await import("./connect");
    const { session } = await workspace("FREE", ["EMAIL", "GOOGLE_CALENDAR"]);
    redirects.length = 0;
    await expect(connectWhatsApp(session)).rejects.toThrow(/NEXT_REDIRECT/);
    expect(redirects[0]).toBe("/dashboard/settings?tab=connections&connect_error=limit&provider=WHATSAPP");
    expect(network).not.toHaveBeenCalled();
  });

  it("Free with a free slot: sent to Meta's own authorization screen, with no secret in the URL", async () => {
    configureMeta();
    const { connectInstagram, connectWhatsApp } = await import("./connect");
    const { session } = await workspace("FREE", ["EMAIL"]);
    redirects.length = 0;
    await expect(connectInstagram(session)).rejects.toThrow(/NEXT_REDIRECT/);
    expect(redirects[0]).toMatch(/^https:\/\/www\.instagram\.com\/oauth\/authorize\?/);
    expect(redirects[0]).not.toContain(SECRET);
    redirects.length = 0;
    await expect(connectWhatsApp(session)).rejects.toThrow(/NEXT_REDIRECT/);
    expect(redirects[0]).toMatch(/^https:\/\/www\.facebook\.com\/v21\.0\/dialog\/oauth\?/);
    expect(redirects[0]).not.toContain(SECRET);
  });

  it("an already-connected Instagram may always reconnect: it re-uses its own slot", async () => {
    configureMeta();
    const { connectInstagram } = await import("./connect");
    const { session, businessId } = await workspace("FREE", ["EMAIL"]);
    await prisma.integration.create({ data: { businessId, provider: "INSTAGRAM", status: "CONNECTED", accessToken: "t", externalId: "ig_own" } });
    redirects.length = 0;
    await expect(connectInstagram(session)).rejects.toThrow(/NEXT_REDIRECT/);
    expect(redirects[0]).toMatch(/^https:\/\/www\.instagram\.com\//);
  });

  it("refuses outright when the deployment has no Meta configuration, rather than building a broken URL", async () => {
    vi.stubEnv("INSTAGRAM_APP_ID", "");
    vi.stubEnv("WHATSAPP_CONFIG_ID", "");
    const { connectInstagram, connectWhatsApp } = await import("./connect");
    const { session } = await workspace("BUSINESS");
    await expect(connectInstagram(session)).rejects.toThrow(/isn't configured/i);
    await expect(connectWhatsApp(session)).rejects.toThrow(/isn't configured/i);
  });

  it("a member who is not an owner or admin cannot start a Meta connection", async () => {
    configureMeta();
    const { connectInstagram } = await import("./connect");
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const b = await prisma.business.create({ data: { name: "Meta Role", handle: `meta-role-${stamp}` } });
    ids.push(b.id);
    const u = await prisma.user.create({ data: { name: "P", email: `meta-role-${stamp}@example.com`, passwordHash: "x" } });
    await prisma.orgMembership.create({ data: { userId: u.id, businessId: b.id, role: "PHOTOGRAPHER" } });
    await expect(connectInstagram({ userId: u.id, activeBusinessId: b.id })).rejects.toThrow(/unauthorized/);
  });
});
