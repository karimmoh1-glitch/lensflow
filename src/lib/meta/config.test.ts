import { describe, it, expect, vi, afterEach } from "vitest";
import { metaConfigReport, metaProductReady, metaWebhookReady, connectionState, appUrlReport, metaWebhookUrl } from "./config";

/**
 * The configuration layer is what the Integrations page shows an operator and what every
 * Meta code path asks before it offers a Connect button. Two things are tested: that it
 * only says "ready" when a deployment genuinely could complete a connection, and that
 * nothing it returns contains a value.
 */
const SECRET = "0123456789abcdef0123456789abcdef";
const APP_ID = "1234567890123456";

function configureAll() {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://daythread.org");
  vi.stubEnv("META_APP_ID", APP_ID);
  vi.stubEnv("META_APP_SECRET", SECRET);
  vi.stubEnv("META_WEBHOOK_VERIFY_TOKEN", "a-long-random-verify-token");
  vi.stubEnv("INSTAGRAM_APP_ID", APP_ID);
  vi.stubEnv("INSTAGRAM_APP_SECRET", SECRET);
  vi.stubEnv("WHATSAPP_CONFIG_ID", APP_ID);
}

describe("Meta configuration report", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is ready only when every value for that product is present and well-formed", () => {
    configureAll();
    expect(metaProductReady("instagram")).toBe(true);
    expect(metaProductReady("whatsapp")).toBe(true);
    vi.stubEnv("WHATSAPP_CONFIG_ID", "");
    expect(metaProductReady("whatsapp")).toBe(false);
    expect(metaProductReady("instagram")).toBe(true);
  });

  it("reports nothing as configured on a deployment with no Meta variables at all", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    for (const k of ["META_APP_ID", "META_APP_SECRET", "META_WEBHOOK_VERIFY_TOKEN", "INSTAGRAM_APP_ID", "INSTAGRAM_APP_SECRET", "WHATSAPP_CONFIG_ID"]) vi.stubEnv(k, "");
    const report = metaConfigReport();
    expect(report.anyReady).toBe(false);
    expect(metaWebhookReady()).toBe(false);
    expect(report.products.every((p) => p.settings.every((s) => s.state === "missing"))).toBe(true);
  });

  it("flags a malformed app secret as invalid but still lets Meta be the judge of it", () => {
    // Meta changes its formats; refusing to show a Connect button over a shape guess would
    // be worse than letting Meta reject a bad credential itself. A public URL Meta could
    // never call back is different, and does block — see the production test below.
    configureAll();
    vi.stubEnv("META_APP_SECRET", "obviously-not-a-meta-secret");
    const wa = metaConfigReport().products.find((p) => p.product === "whatsapp")!;
    const setting = wa.settings.find((s) => s.key === "META_APP_SECRET")!;
    expect(setting.state).toBe("invalid");
    expect(setting.blocking).toBe(false);
    expect(wa.ready).toBe(true);
  });

  it("a public URL Meta could never call back does block the product", () => {
    configureAll();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
    const report = metaConfigReport();
    expect(report.anyReady).toBe(false);
    expect(report.appUrl.blocking).toBe(true);
  });

  it("never puts a secret value in the report, only its state", () => {
    configureAll();
    const serialized = JSON.stringify(metaConfigReport());
    expect(serialized).not.toContain(SECRET);
    expect(serialized).not.toContain("a-long-random-verify-token");
    expect(serialized).toContain("META_APP_SECRET");
    // The app id is not a secret, but it is still not echoed anywhere in the report.
    expect(serialized).not.toContain(APP_ID);
  });

  it("marks every secret setting as secret so the UI can never render one", () => {
    configureAll();
    const secrets = metaConfigReport()
      .products.flatMap((p) => p.settings)
      .filter((s) => s.secret)
      .map((s) => s.key);
    expect(secrets).toContain("META_APP_SECRET");
    expect(secrets).toContain("INSTAGRAM_APP_SECRET");
    expect(secrets).toContain("META_WEBHOOK_VERIFY_TOKEN");
  });

  it("builds the webhook and redirect URLs from the configured app URL, never a request host", () => {
    configureAll();
    const r = metaConfigReport();
    expect(r.webhookUrl).toBe("https://daythread.org/api/webhooks/meta");
    expect(r.redirectUris.instagram).toBe("https://daythread.org/api/auth/instagram/callback");
    expect(r.redirectUris.whatsapp).toBe("https://daythread.org/api/auth/whatsapp/callback");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://daythread.org/");
    expect(metaWebhookUrl()).toBe("https://daythread.org/api/webhooks/meta");
  });

  it("rejects an app URL Meta could never call back, in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
    expect(appUrlReport().state).toBe("invalid");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://daythread-git-main-x.vercel.app");
    expect(appUrlReport().state).toBe("invalid");
    expect(appUrlReport().note).toMatch(/preview deployment/i);
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://daythread.org");
    expect(appUrlReport().state).toBe("invalid");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://daythread.org");
    expect(appUrlReport().state).toBe("configured");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "not a url");
    expect(appUrlReport().state).toBe("invalid");
  });

  it("lets localhost through outside production, so development still works", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
    expect(appUrlReport().state).toBe("configured");
  });

  it("separates webhook readiness from either product being fully configured", () => {
    vi.stubEnv("META_WEBHOOK_VERIFY_TOKEN", "a-long-random-verify-token");
    vi.stubEnv("INSTAGRAM_APP_SECRET", SECRET);
    vi.stubEnv("META_APP_SECRET", "");
    vi.stubEnv("WHATSAPP_CONFIG_ID", "");
    expect(metaWebhookReady()).toBe(true);
    expect(metaProductReady("whatsapp")).toBe(false);
  });
});

describe("connectionState", () => {
  it("never says CONNECTED for a deployment that isn't configured", () => {
    expect(connectionState({ status: "CONNECTED", accessToken: "t" }, false)).toBe("CONFIGURATION_REQUIRED");
    expect(connectionState(null, false)).toBe("CONFIGURATION_REQUIRED");
  });

  it("maps every row shape to the state the product talks about", () => {
    expect(connectionState(null, true)).toBe("NOT_CONNECTED");
    expect(connectionState({ status: "NOT_CONNECTED" }, true)).toBe("NOT_CONNECTED");
    expect(connectionState({ status: "CONNECTED", accessToken: "t" }, true)).toBe("CONNECTED");
    expect(connectionState({ status: "NEEDS_ATTENTION", accessToken: "t" }, true)).toBe("REAUTH_REQUIRED");
    expect(connectionState({ status: "ERROR", accessToken: "t" }, true)).toBe("ERROR");
    expect(connectionState({ status: "SYNC_ERROR", accessToken: "t" }, true)).toBe("ERROR");
    expect(connectionState({ status: "CONNECTED", accessToken: "t", lastSyncStatus: "failed" }, true)).toBe("ERROR");
  });

  it("treats a CONNECTED row with no usable credential as needing re-authorization", () => {
    // This is exactly what a token that will not decrypt looks like after the Prisma
    // extension hands it back: null. It must never read as a working connection.
    expect(connectionState({ status: "CONNECTED", accessToken: null, refreshToken: null }, true)).toBe("REAUTH_REQUIRED");
    expect(connectionState({ status: "CONNECTED", accessToken: null, refreshToken: "r" }, true)).toBe("CONNECTED");
  });
});
