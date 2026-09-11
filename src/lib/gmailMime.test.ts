import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { sendGmailMessage } from "@/lib/google";

/**
 * What actually leaves for the customer. The body used to be declared 7bit while carrying
 * UTF-8, so an accented name, a curly quote or an em-dash went out as raw bytes the
 * receiving server was told not to expect — and Daythread's own templates contain an
 * em-dash, so every one of them was affected.
 */
const decode = (raw: string) => Buffer.from(raw.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");

describe("the message Gmail is handed", () => {
  let sent: string | null = null;

  beforeEach(() => {
    sent = null;
    vi.stubGlobal("fetch", async (_url: string, init?: RequestInit) => {
      sent = JSON.parse(String(init?.body)).raw;
      return new Response(JSON.stringify({ id: "gm-1" }), { status: 200, headers: { "content-type": "application/json" } });
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  const send = (extra: Partial<Parameters<typeof sendGmailMessage>[0]> = {}) =>
    sendGmailMessage({ accessToken: "tok", fromEmail: "studio@example.test", fromName: "Rivera Studio", to: "dana@example.test", subject: "Your files", body: "Hello — your files are ready.", ...extra });

  it("declares base64 and round-trips a non-ASCII body unchanged", async () => {
    await send({ body: "Hôtel — déjà vu — “curly” quotes — 🎉" });
    const mime = decode(sent!);
    expect(mime).toContain("Content-Transfer-Encoding: base64");
    expect(mime).not.toContain("7bit");
    const body = decode(mime.split("\r\n\r\n").slice(1).join("\r\n\r\n").trim());
    expect(body).toContain("Hôtel — déjà vu — “curly” quotes — 🎉");
  });

  it("sends text and HTML as alternatives, text first", async () => {
    await send({ body: "Plain words", html: "<p>Rich words</p>" });
    const mime = decode(sent!);
    expect(mime).toContain("multipart/alternative");
    const textAt = mime.indexOf("text/plain");
    const htmlAt = mime.indexOf("text/html");
    expect(textAt).toBeGreaterThan(-1);
    expect(htmlAt).toBeGreaterThan(textAt);
    // Both parts are really in there, and both decode to what was passed in.
    const parts = mime.split(/--dt_[a-z0-9_]+/).filter((p) => p.includes("Content-Type: text/"));
    const decoded = parts.map((p) => decode(p.split("\r\n\r\n").slice(1).join("\r\n\r\n").trim()));
    expect(decoded.some((d) => d.includes("Plain words"))).toBe(true);
    expect(decoded.some((d) => d.includes("<p>Rich words</p>"))).toBe(true);
  });

  it("stays a simple text message when there is no HTML part", async () => {
    await send();
    const mime = decode(sent!);
    expect(mime).not.toContain("multipart");
    expect(mime).toContain('Content-Type: text/plain; charset="UTF-8"');
  });

  it("carries threading and reply headers when it has them", async () => {
    await send({ replyTo: "studio@inbound.daythread.org", inReplyTo: "<abc@mail.example>", references: "<abc@mail.example>" });
    const mime = decode(sent!);
    expect(mime).toContain("Reply-To: studio@inbound.daythread.org");
    expect(mime).toContain("In-Reply-To: <abc@mail.example>");
    expect(mime).toContain("References: <abc@mail.example>");
  });

  it("encodes a display name and subject rather than putting raw bytes in a header", async () => {
    await send({ fromName: "Café Rivera", subject: "Vos fichiers — prêts" });
    const mime = decode(sent!);
    expect(mime).toMatch(/From: =\?UTF-8\?B\?[^?]+\?= <studio@example\.test>/);
    expect(mime).toMatch(/Subject: =\?UTF-8\?B\?[^?]+\?=/);
    expect(mime).not.toContain("Café Rivera");
  });
});
