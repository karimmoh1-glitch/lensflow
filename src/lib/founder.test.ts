import { describe, it, expect, afterEach } from "vitest";
import { isFounder, founderEmails, EMAIL_VERIFICATION_TRACKED_SINCE } from "./founder";

const prev = process.env.FOUNDER_EMAILS;
afterEach(() => { if (prev === undefined) delete process.env.FOUNDER_EMAILS; else process.env.FOUNDER_EMAILS = prev; });

const verified = (email: string) => ({ email, emailVerifiedAt: new Date(), createdAt: new Date() });

describe("founder gate", () => {
  it("nobody is a founder when the list is unset", () => {
    delete process.env.FOUNDER_EMAILS;
    expect(founderEmails()).toEqual([]);
    expect(isFounder(verified("anyone@example.com"))).toBe(false);
    expect(isFounder({ email: "" })).toBe(false);
  });

  it("matches the stored lower-case address exactly, and nothing else", () => {
    process.env.FOUNDER_EMAILS = " Karim@Example.com , second@example.com";
    expect(isFounder(verified("karim@example.com"))).toBe(true);
    expect(isFounder(verified("second@example.com"))).toBe(true);
    // A mixed-case duplicate account is a different account, not the founder.
    expect(isFounder(verified("SECOND@example.com"))).toBe(false);
    expect(isFounder(verified("karim@example.com.evil"))).toBe(false);
    expect(isFounder(null)).toBe(false);
  });

  it("an address nobody has proven is not a founder, unless the account predates verification tracking", () => {
    process.env.FOUNDER_EMAILS = "karim@example.com";
    expect(isFounder({ email: "karim@example.com", emailVerifiedAt: null, createdAt: new Date() })).toBe(false);
    expect(isFounder({ email: "karim@example.com", emailVerifiedAt: null, createdAt: new Date(EMAIL_VERIFICATION_TRACKED_SINCE.getTime() - 1000) })).toBe(true);
  });
});
