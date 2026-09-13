import { describe, it, expect } from "vitest";
import { signOAuthStateRaw, verifyOAuthStateWithNonce } from "./oauthState";

describe("OAuth state", () => {
  const base = { businessId: "biz_a", userId: "user_a" } as const;

  it("verifies a fresh state bound to its nonce and provider", async () => {
    const { state, nonce } = await signOAuthStateRaw({ provider: "google", purpose: "calendar", ...base });
    const r = await verifyOAuthStateWithNonce("google", state, nonce);
    expect(r).toEqual({ ok: true, state: { businessId: "biz_a", userId: "user_a", purpose: "calendar", returnTo: "settings" } });
  });
  it("carries a return destination only from the closed set; anything else lands on the hub", async () => {
    const onboarding = await signOAuthStateRaw({ provider: "google", purpose: "gmail", ...base, returnTo: "onboarding" });
    expect(await verifyOAuthStateWithNonce("google", onboarding.state, onboarding.nonce)).toMatchObject({ ok: true, state: { returnTo: "onboarding" } });
    // A signed state can only be minted by this server, but the claim is still validated on
    // the way out so a future caller can never smuggle a URL through it.
    const foreign = await signOAuthStateRaw({ provider: "google", purpose: "gmail", ...base, returnTo: "https://evil.example/phish" });
    expect(await verifyOAuthStateWithNonce("google", foreign.state, foreign.nonce)).toMatchObject({ ok: true, state: { returnTo: "settings" } });
    const path = await signOAuthStateRaw({ provider: "google", purpose: "gmail", ...base, returnTo: "/dashboard/billing" });
    expect(await verifyOAuthStateWithNonce("google", path.state, path.nonce)).toMatchObject({ ok: true, state: { returnTo: "settings" } });
  });
  it("rejects a missing, tampered, or foreign-signed state", async () => {
    expect((await verifyOAuthStateWithNonce("google", null, "x")).ok).toBe(false);
    const { state, nonce } = await signOAuthStateRaw({ provider: "google", purpose: "gmail", ...base });
    const tampered = state.slice(0, -3) + "abc";
    expect(await verifyOAuthStateWithNonce("google", tampered, nonce)).toMatchObject({ ok: false, reason: "invalid" });
  });
  it("rejects a state presented to a different provider's callback", async () => {
    const { state, nonce } = await signOAuthStateRaw({ provider: "google", purpose: "gmail", ...base });
    expect(await verifyOAuthStateWithNonce("instagram", state, nonce)).toMatchObject({ ok: false, reason: "wrong_provider" });
  });
  it("rejects a state whose browser nonce doesn't match (someone else's link), and a reused one", async () => {
    const { state } = await signOAuthStateRaw({ provider: "instagram", purpose: "messaging", ...base });
    expect(await verifyOAuthStateWithNonce("instagram", state, "different-browser")).toMatchObject({ ok: false, reason: "nonce_mismatch" });
    expect(await verifyOAuthStateWithNonce("instagram", state, null)).toMatchObject({ ok: false, reason: "nonce_mismatch" }); // cookie already consumed
  });
  it("rejects an expired state", async () => {
    const { state, nonce } = await signOAuthStateRaw({ provider: "whatsapp", purpose: "messaging", ...base, expiresIn: "1s" });
    await new Promise((r) => setTimeout(r, 1200));
    expect(await verifyOAuthStateWithNonce("whatsapp", state, nonce)).toMatchObject({ ok: false, reason: "expired" });
  });
});
