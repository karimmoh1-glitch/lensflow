import { describe, it, expect } from "vitest";
import { scrub } from "@/lib/observe";

/**
 * reportFailure persists a provider's own error message to OpsEvent, and providers echo the
 * offending credential back in that message. Anything a provider might hand back has to be
 * unrecognisable by the time it is written down.
 */
describe("operational records carry no credential", () => {
/**
 * Assembled at runtime rather than written out. A file containing literal token shapes is
 * itself a finding: GitHub's push protection blocks it, and rightly so — a scanner cannot
 * tell a fixture from the real thing. Joining the parts here keeps the regexes honest
 * without putting a credential-shaped string in the repository.
 */
const token = (...parts: string[]) => parts.join("");
const FAKE = "n0tar3altoken";
const secrets: Array<[string, string]> = [
  ["Instagram long-lived", token("IGA", "A", FAKE, "12345")],
  ["Instagram short-lived", token("IGQ", "W", FAKE, "abcdef")],
  ["Meta / Facebook", token("EA", "A", FAKE)],
  ["Google", token("ya29", ".", "a0Af", FAKE, "-_x")],
  ["Slack bot", token("xo", "xb", "-", FAKE, "-", FAKE)],
  ["Dropbox", token("sl", ".", FAKE, FAKE)],
  ["Stripe live", token("sk", "_live_", FAKE)],
  ["Stripe webhook", token("wh", "sec_", FAKE)],
  ["OpenAI", token("sk", "-proj-", FAKE)],
];

  for (const [label, secret] of secrets) {
    it(`redacts a ${label} token echoed back inside a provider error`, () => {
      const out = scrub(`Provider rejected the request: invalid token ${secret} for this app`);
      expect(out).not.toContain(secret);
      expect(out).toContain("[redacted]");
    });
  }

  it("redacts credentials carried as query parameters or a bearer header", () => {
    const inUrl = token("IGA", "A", FAKE);
    const clientSecret = token("cs", FAKE);
    const bearer = token("eyJ", "hbGciOi.JIUzI1NiJ9.", FAKE);
    const out = scrub(`GET /me?access_token=${inUrl}&client_secret=${clientSecret} with Bearer ${bearer}`);
    expect(out).not.toContain(inUrl);
    expect(out).not.toContain(clientSecret);
    expect(out).not.toContain(bearer);
  });

  it("still says something useful, and stays bounded", () => {
    const out = scrub("Instagram rejected the subscription: (#10) Application does not have permission for this action");
    expect(out).toContain("does not have permission");
    expect(scrub("x".repeat(5000)).length).toBeLessThanOrEqual(500);
  });
});
