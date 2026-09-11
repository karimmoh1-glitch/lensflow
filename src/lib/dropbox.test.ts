import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";

/**
 * The three Dropbox defects that made a connection impossible, pinned so they cannot come
 * back. Each was found by reading the code against Dropbox's documented contract, and each
 * failed silently in a different way.
 */
import { dropboxCurrentAccount, ensureDropboxFolder, listDropboxFolder, dropboxFolderLink, dropboxAuthUrl, dropboxConfigured } from "./dropbox";

type Call = { url: string; method: string; headers: Record<string, string>; body: string | null };
const calls: Call[] = [];
let responder: (url: string, call: Call) => Response = () => new Response("{}", { status: 200 });

beforeAll(() => {
  vi.stubEnv("DROPBOX_APP_KEY", "appkey");
  vi.stubEnv("DROPBOX_APP_SECRET", "appsecret");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://daythread.org");
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    const headers = Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]));
    const call: Call = { url: String(url), method: init?.method ?? "GET", headers, body: typeof init?.body === "string" ? init.body : null };
    calls.push(call);
    return responder(String(url), call);
  });
});
afterEach(() => { calls.length = 0; responder = () => new Response("{}", { status: 200 }); });
afterAll(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("Dropbox: no-argument endpoints carry no body and no content type", () => {
  it("identifying the account sends neither, which is what Dropbox requires", async () => {
    responder = () => json({ account_id: "dbid:a", email: "owner@example.test", name: { display_name: "Owner" } });
    const account = await dropboxCurrentAccount("tok");
    expect(account).toMatchObject({ accountId: "dbid:a", email: "owner@example.test" });
    const call = calls.find((c) => c.url.includes("users/get_current_account"));
    expect(call?.method).toBe("POST");
    // Dropbox rejects a JSON content type on endpoints that take no arguments, and this is
    // the first call after authorization — so getting it wrong failed the whole connection.
    expect(call?.headers["content-type"]).toBeUndefined();
    expect(call?.body ?? null).toBeNull();
  });

  it("endpoints that do take arguments still send JSON", async () => {
    responder = () => json({ metadata: { id: "id:1", path_display: "/Clients/Jane", name: "Jane" } });
    await ensureDropboxFolder("tok", "/Clients/Jane");
    const call = calls.find((c) => c.url.includes("files/create_folder_v2"));
    expect(call?.headers["content-type"]).toBe("application/json");
    expect(JSON.parse(call!.body!)).toMatchObject({ path: "/Clients/Jane", autorename: false });
  });
});

describe("Dropbox: folder links work on a personal account", () => {
  it("never asks for team_only, which a personal account refuses outright", async () => {
    responder = () => json({ url: "https://www.dropbox.com/scl/fo/abc" });
    const link = await dropboxFolderLink("tok", "/Clients/Jane");
    expect(link).toBe("https://www.dropbox.com/scl/fo/abc");
    const call = calls.find((c) => c.url.includes("create_shared_link_with_settings"));
    const sent = JSON.parse(call!.body!);
    expect(sent.path).toBe("/Clients/Jane");
    expect(JSON.stringify(sent)).not.toContain("team_only");
    expect(sent.settings).toBeUndefined();
  });

  it("an existing link is found rather than reported as no link at all", async () => {
    responder = (url) => {
      if (url.includes("create_shared_link_with_settings")) return json({ error_summary: "shared_link_already_exists/..." }, 409);
      if (url.includes("list_shared_links")) return json({ links: [{ url: "https://www.dropbox.com/scl/fo/existing" }] });
      return json({});
    };
    expect(await dropboxFolderLink("tok", "/Clients/Jane")).toBe("https://www.dropbox.com/scl/fo/existing");
    expect(calls.some((c) => c.url.includes("list_shared_links"))).toBe(true);
  });

  it("requests sharing.read, without which the existing-link fallback can never run", () => {
    const url = new URL(dropboxAuthUrl("state123", "challenge"));
    const scopes = (url.searchParams.get("scope") ?? "").split(" ");
    expect(scopes).toContain("sharing.read");
    expect(scopes).toContain("sharing.write");
    expect(scopes).toContain("files.content.write");
    expect(scopes).toContain("files.metadata.read");
    expect(scopes).toContain("account_info.read");
  });
});

describe("Dropbox: the authorization request itself", () => {
  it("asks for an offline token with PKCE, and carries no secret in the URL", () => {
    const url = new URL(dropboxAuthUrl("state123", "challenge123"));
    expect(url.origin + url.pathname).toBe("https://www.dropbox.com/oauth2/authorize");
    expect(url.searchParams.get("token_access_type")).toBe("offline");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toBe("challenge123");
    expect(url.searchParams.get("state")).toBe("state123");
    expect(url.searchParams.get("redirect_uri")).toBe("https://daythread.org/api/auth/dropbox/callback");
    expect(url.toString()).not.toContain("appsecret");
    expect(dropboxConfigured()).toBe(true);
  });
});

describe("Dropbox: failures are reported, never guessed at", () => {
  it("a folder that already exists is reused rather than duplicated", async () => {
    responder = (url) => {
      if (url.includes("create_folder_v2")) return json({ error_summary: "path/conflict/folder/..." }, 409);
      if (url.includes("get_metadata")) return json({ id: "id:existing", path_display: "/Clients/Jane", name: "Jane" });
      return json({});
    };
    const folder = await ensureDropboxFolder("tok", "/Clients/Jane");
    expect(folder).toMatchObject({ id: "id:existing", path: "/Clients/Jane" });
  });

  it("a revoked token surfaces as an error instead of an empty folder", async () => {
    responder = () => json({ error_summary: "expired_access_token/" }, 401);
    await expect(listDropboxFolder("tok", "/Clients/Jane")).rejects.toThrow();
  });

  it("when no link can be made, the answer is null rather than a fabricated URL", async () => {
    responder = () => json({ error_summary: "settings_error/not_authorized/" }, 403);
    expect(await dropboxFolderLink("tok", "/Clients/Jane")).toBeNull();
  });
});
