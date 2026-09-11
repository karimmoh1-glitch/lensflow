import { describe, it, expect, vi, afterEach } from "vitest";
import { EmailAdapter } from "./emailAdapter";
import { WebsiteAdapter } from "./websiteAdapter";
import { PhoneAdapter } from "./phoneAdapter";

/**
 * An unconfigured channel is the normal state on a deployment that has not added a provider
 * yet, so whatever that branch writes is written for every message a business ever sends.
 * It must never be the message. These bodies carry customer correspondence and, since file
 * delivery shipped, the share links that give access to a client's files.
 */
const SECRET_BODY = "Your gallery is ready: https://drive.google.com/drive/folders/SECRET-FOLDER-ID";
const RECIPIENT = "sarah.private@example.test";

describe("unconfigured channels never log what was being sent", () => {
  afterEach(() => vi.restoreAllMocks());

  const cases = [
    { name: "email", run: () => new EmailAdapter().send({ channel: "EMAIL", to: RECIPIENT, body: SECRET_BODY, subject: "Your files" }) },
    { name: "website", run: () => new WebsiteAdapter().send({ channel: "WEBSITE", to: RECIPIENT, body: SECRET_BODY }) },
    { name: "phone", run: () => new PhoneAdapter().send({ channel: "PHONE", to: RECIPIENT, body: SECRET_BODY }) },
  ];

  for (const c of cases) {
    it(`${c.name}: logs neither the body nor the recipient`, async () => {
      const written: string[] = [];
      for (const level of ["log", "info", "warn", "error", "debug"] as const) {
        vi.spyOn(console, level).mockImplementation((...args: unknown[]) => { written.push(args.map(String).join(" ")); });
      }
      const result = await c.run();
      const all = written.join("\n");
      expect(all).not.toContain(SECRET_BODY);
      expect(all).not.toContain("SECRET-FOLDER-ID");
      expect(all).not.toContain(RECIPIENT);
      // It still says something, so an operator can tell a send was skipped.
      expect(result).toBeTruthy();
    });
  }
});
