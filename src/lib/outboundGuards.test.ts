import { describe, it, expect } from "vitest";
import { caldavTarget } from "@/lib/caldav";
import { graphLink } from "@/lib/microsoft";
import { readBoundedText, PayloadTooLarge } from "@/lib/http";
import { isSafeHttpsUrl } from "@/lib/utils";
import { publicMessage } from "@/lib/mobileApi";

/** Where credentials and tokens may be sent, what links people may click, and what errors may say. */
describe("outbound and output guards", () => {
  it("Apple credentials only go to icloud.com over https", () => {
    expect(caldavTarget("https://caldav.icloud.com", "/123/calendars/")).toBe("https://caldav.icloud.com/123/calendars/");
    expect(caldavTarget("https://caldav.icloud.com", "https://p12-caldav.icloud.com/123/")).toBe("https://p12-caldav.icloud.com/123/");
    for (const bad of ["https://evil.example/steal", "http://caldav.icloud.com/x", "https://icloud.com.evil.example/", "https://user:pw@caldav.icloud.com/", "http://169.254.169.254/latest/meta-data"]) {
      expect(() => caldavTarget("https://caldav.icloud.com", bad)).toThrow(/outside icloud/);
    }
    expect(() => caldavTarget("https://attacker.example", "/123/")).toThrow();
  });

  it("Graph paging links only go to graph.microsoft.com", () => {
    expect(graphLink("https://graph.microsoft.com/v1.0/me/messages/delta?$deltatoken=a")).toContain("graph.microsoft.com");
    for (const bad of ["https://graph.microsoft.com.evil.example/x", "http://graph.microsoft.com/v1.0", "https://evil.example/?graph.microsoft.com", "not a url"]) {
      expect(() => graphLink(bad)).toThrow();
    }
  });

  it("a body without a length header is cut off at the ceiling while streaming", async () => {
    const big = new ReadableStream({ start(c) { for (let i = 0; i < 20; i++) c.enqueue(new Uint8Array(1024)); c.close(); } });
    const req = new Request("http://localhost/x", { method: "POST", body: big, duplex: "half" } as RequestInit);
    await expect(readBoundedText(req, 4096)).rejects.toBeInstanceOf(PayloadTooLarge);
    expect(await readBoundedText(new Request("http://localhost/x", { method: "POST", body: "héllo" }), 4096)).toBe("héllo");
  });

  it("only real https links are clickable", () => {
    expect(isSafeHttpsUrl("https://gallery.example/jane")).toBe(true);
    for (const bad of ["javascript:alert(1)//https://x", "data:text/html,<script>", "http://gallery.example", "https://user:pass@x.example", "//x.example", "", null, 42]) expect(isSafeHttpsUrl(bad)).toBe(false);
  });

  it("API errors carry our sentences, never internals", () => {
    expect(publicMessage(new Error("That booking doesn't exist in this workspace."), "fallback")).toBe("That booking doesn't exist in this workspace.");
    expect(publicMessage(new Error("\nInvalid `prisma.booking.update()` invocation:\nP2025"), "fallback")).toBe("fallback");
    expect(publicMessage(new Error("Cannot read properties of undefined (reading 'id')"), "fallback")).toBe("fallback");
    expect(publicMessage("nope", "fallback")).toBe("fallback");
  });
});
