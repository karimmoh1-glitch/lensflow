import { describe, it, expect, afterAll, vi } from "vitest";
import { prisma } from "@/lib/db";
import { signOAuthStateRaw } from "@/lib/integrations/oauthState";
import { completeOAuthConnect } from "@/server/oauthConnect";

/**
 * One external account feeds one workspace. Two admins finishing a flow for the same
 * account at the same moment both used to pass the "is it connected elsewhere?" check,
 * and inbound messages then went to whichever row the database returned first.
 */
const cookies = vi.hoisted(() => ({ nonce: null as string | null }));
const session = vi.hoisted(() => ({ current: null as { userId: string; activeBusinessId: string } | null }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "dropbox_oauth_nonce" && cookies.nonce ? { value: cookies.nonce } : undefined), set: () => {}, delete: () => {} }),
}));
vi.mock("@/lib/auth", async (orig) => ({ ...(await orig<typeof import("@/lib/auth")>()), getSession: async () => session.current }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const ids: string[] = [];
const users: string[] = [];

async function workspace() {
  const s = stamp();
  const b = await prisma.business.create({ data: { name: `Excl ${s}`, handle: `excl-${s}` } });
  const u = await prisma.user.create({ data: { name: "Admin", email: `excl-${s}@example.test`, passwordHash: "x" } });
  await prisma.orgMembership.create({ data: { userId: u.id, businessId: b.id, role: "OWNER" } });
  ids.push(b.id);
  users.push(u.id);
  return { businessId: b.id, userId: u.id };
}

afterAll(async () => {
  await prisma.business.deleteMany({ where: { id: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  vi.unstubAllEnvs();
});

describe("one account, one workspace", () => {
  it("of two workspaces finishing a flow for the same account at once, exactly one is connected", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
    const a = await workspace();
    const b = await workspace();
    const account = `dbid:${stamp()}`;
    // A minimal Dropbox-shaped spec: the provider is replaced by canned answers, everything
    // else — state, session and membership binding, the exclusivity lock, activation — is real.
    let gate: () => void = () => {};
    const both = new Promise<void>((r) => { let n = 0; gate = () => { if (++n === 2) r(); }; });
    const spec = {
      oauthProvider: "dropbox" as const,
      purposes: ["files" as const],
      providerFor: () => "DROPBOX" as const,
      exchange: async () => ({ accessToken: `tok-${stamp()}`, refreshToken: `ref-${stamp()}`, expiresAt: new Date(Date.now() + 3_600_000), scope: "files.metadata.write", raw: {} }),
      identity: async () => {
        // Both flows reach the check at the same time, then race for the lock.
        gate();
        await both;
        return { externalId: account, externalAccount: "shared@example.com" };
      },
      exclusive: true,
      revoke: async () => {},
    };
    const run = async (w: { businessId: string; userId: string }) => {
      const { state, nonce } = await signOAuthStateRaw({ provider: "dropbox", purpose: "files", businessId: w.businessId, userId: w.userId });
      // Each request carries its own nonce cookie and session; the mocks answer per call.
      cookies.nonce = nonce;
      session.current = { userId: w.userId, activeBusinessId: w.businessId };
      return completeOAuthConnect(new Request(`http://localhost:3000/api/auth/dropbox/callback?code=c&state=${state}`), spec);
    };
    // Sequenced starts so each flow reads its own cookie and session before the other's are set.
    const first = run(a);
    await new Promise((r) => setTimeout(r, 30));
    const second = run(b);
    const results = await Promise.all([first, second]);
    const outcomes = results.map((r) => new URL(r.headers.get("location")!).searchParams.get("connect_error") ?? "connected").sort();
    expect(outcomes).toEqual(["connected", "in_use"]);
    expect(await prisma.integration.count({ where: { provider: "DROPBOX", externalId: account, status: "CONNECTED" } })).toBe(1);
  });
});
