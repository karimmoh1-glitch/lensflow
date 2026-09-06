import { describe, it, expect, vi, afterEach } from "vitest";
import { exchangeWhatsAppCode, discoverWabas } from "./whatsapp";
import { instagramGrantedScopes, exchangeInstagramCode } from "./instagram";
import { instagramAuthUrl, instagramRedirectUri, isProfessionalAccount, IG_SCOPES, instagramConfigured } from "./instagram";
import { whatsappAuthUrl, whatsappRedirectUri, whatsappConfigured, WA_SCOPES, withinServiceWindow, serviceWindowRemainingMs, templatesEnabled, WA_WINDOW_MS, WA_WINDOW_CLOSED_MESSAGE } from "./whatsapp";

/**
 * The authorization URLs are the one place a secret could leak into something a browser
 * sees — they are built server-side and then followed by the user's own browser, so the
 * client id belongs in them and the client secret never can.
 */
const SECRET = "0123456789abcdef0123456789abcdef";
const IG_APP = "1111111111111111";
const META_APP = "2222222222222222";
const CONFIG = "3333333333333333";

function configure() {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://daythread.org");
  vi.stubEnv("INSTAGRAM_APP_ID", IG_APP);
  vi.stubEnv("INSTAGRAM_APP_SECRET", SECRET);
  vi.stubEnv("META_APP_ID", META_APP);
  vi.stubEnv("META_APP_SECRET", SECRET);
  vi.stubEnv("WHATSAPP_CONFIG_ID", CONFIG);
  vi.stubEnv("META_WEBHOOK_VERIFY_TOKEN", "a-long-random-verify-token");
}

describe("Instagram authorization URL", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("asks Meta for exactly the scopes Daythread uses, and no secret", () => {
    configure();
    const url = new URL(instagramAuthUrl("signed.state.value"));
    expect(url.origin + url.pathname).toBe("https://www.instagram.com/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe(IG_APP);
    expect(url.searchParams.get("scope")).toBe(IG_SCOPES.join(","));
    expect(url.searchParams.get("state")).toBe("signed.state.value");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.toString()).not.toContain(SECRET);
    expect(url.searchParams.get("client_secret")).toBeNull();
  });

  it("sends Meta the deployment's own https callback, never a request host", () => {
    configure();
    expect(instagramRedirectUri()).toBe("https://daythread.org/api/auth/instagram/callback");
    expect(new URL(instagramAuthUrl("s")).searchParams.get("redirect_uri")).toBe("https://daythread.org/api/auth/instagram/callback");
  });

  it("is not offered at all when the deployment isn't configured", () => {
    vi.stubEnv("INSTAGRAM_APP_ID", "");
    expect(instagramConfigured()).toBe(false);
  });

  it("allows only the account types Meta permits messaging for", () => {
    expect(isProfessionalAccount("BUSINESS")).toBe(true);
    expect(isProfessionalAccount("MEDIA_CREATOR")).toBe(true);
    expect(isProfessionalAccount("CREATOR")).toBe(true);
    expect(isProfessionalAccount("PERSONAL")).toBe(false);
    // Meta omits the field on some responses; absence is not evidence of a personal account.
    expect(isProfessionalAccount(undefined)).toBe(true);
  });
});

describe("WhatsApp authorization URL", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("carries the Embedded Signup configuration id and no secret", () => {
    configure();
    const url = new URL(whatsappAuthUrl("signed.state.value"));
    expect(url.origin + url.pathname).toBe("https://www.facebook.com/v21.0/dialog/oauth");
    expect(url.searchParams.get("client_id")).toBe(META_APP);
    expect(url.searchParams.get("config_id")).toBe(CONFIG);
    expect(url.searchParams.get("scope")).toBe(WA_SCOPES.join(","));
    expect(url.searchParams.get("override_default_response_type")).toBe("true");
    expect(url.searchParams.get("redirect_uri")).toBe(whatsappRedirectUri());
    expect(url.toString()).not.toContain(SECRET);
  });

  it("is unavailable without the Embedded Signup configuration", () => {
    configure();
    expect(whatsappConfigured()).toBe(true);
    vi.stubEnv("WHATSAPP_CONFIG_ID", "");
    expect(whatsappConfigured()).toBe(false);
  });
});

describe("WhatsApp 24-hour customer service window", () => {
  const now = new Date("2026-09-06T12:00:00Z");

  it("is open for a message just under 24 hours old and closed at 24 hours", () => {
    expect(withinServiceWindow(new Date(now.getTime() - 1000), now)).toBe(true);
    expect(withinServiceWindow(new Date(now.getTime() - (WA_WINDOW_MS - 1000)), now)).toBe(true);
    expect(withinServiceWindow(new Date(now.getTime() - WA_WINDOW_MS), now)).toBe(false);
    expect(withinServiceWindow(new Date(now.getTime() - WA_WINDOW_MS - 1000), now)).toBe(false);
  });

  it("is closed when the customer has never written", () => {
    expect(withinServiceWindow(null, now)).toBe(false);
    expect(serviceWindowRemainingMs(null, now)).toBe(0);
  });

  it("treats a timestamp in the future as a clock problem, not an open window", () => {
    expect(withinServiceWindow(new Date(now.getTime() + 60_000), now)).toBe(false);
  });

  it("reports how much of the window is left", () => {
    expect(serviceWindowRemainingMs(new Date(now.getTime() - 3600_000), now)).toBe(WA_WINDOW_MS - 3600_000);
    expect(serviceWindowRemainingMs(new Date(now.getTime() - 2 * WA_WINDOW_MS), now)).toBe(0);
  });

  it("says templates are not implemented rather than implying a send will work", () => {
    expect(templatesEnabled()).toBe(false);
    expect(WA_WINDOW_CLOSED_MESSAGE).toMatch(/Saved, not delivered/);
    expect(WA_WINDOW_CLOSED_MESSAGE).toMatch(/template/i);
  });
});

describe("secrets never travel in a URL", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  /** Records every URL and header Daythread sends to Meta. */
  function recorder(body: unknown) {
    const seen: Array<{ url: string; auth: string | null }> = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init: RequestInit = {}) => {
      seen.push({ url: String(input), auth: new Headers(init.headers ?? {}).get("authorization") });
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    });
    return seen;
  }

  it("puts the WhatsApp code exchange in a POST body, not the query string", async () => {
    configure();
    const seen = recorder({ access_token: "EAAB-token", expires_in: 5184000 });
    await exchangeWhatsAppCode("the-code");
    expect(seen[0].url).toBe("https://graph.facebook.com/v21.0/oauth/access_token");
    expect(seen[0].url).not.toContain(SECRET);
    expect(seen[0].url).not.toContain("the-code");
  });

  it("sends the app token for debug_token as a header, never as a query parameter", async () => {
    configure();
    const seen = recorder({ data: { granular_scopes: [] } });
    await discoverWabas("EAAB-token");
    expect(seen[0].url).not.toContain(SECRET);
    expect(seen[0].url).toContain("input_token=EAAB-token");
    expect(seen[0].auth).toBe(`Bearer ${META_APP}|${SECRET}`);

    const igSeen = recorder({ data: { scopes: ["instagram_business_manage_messages"] } });
    await instagramGrantedScopes("IGAA-token");
    expect(igSeen[0].url).not.toContain(SECRET);
    expect(igSeen[0].auth).toBe(`Bearer ${IG_APP}|${SECRET}`);
  });

  it("keeps the Instagram code exchange out of the URL as well", async () => {
    configure();
    const seen = recorder({ access_token: "IGAA-short", user_id: "17841400000", expires_in: 5184000 });
    await exchangeInstagramCode("the-code");
    // The first call is a POST whose body carries the secret.
    expect(seen[0].url).toBe("https://api.instagram.com/oauth/access_token");
    expect(seen[0].url).not.toContain(SECRET);
    // The second is Meta's documented long-lived exchange, which only accepts the secret as
    // a query parameter over TLS. It is called out here so the exception stays deliberate.
    expect(seen[1].url).toContain("ig_exchange_token");
    expect(seen[1].url).toContain(SECRET);
  });
});
