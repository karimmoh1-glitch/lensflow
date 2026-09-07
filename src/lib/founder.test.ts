import { describe, it, expect, afterEach } from "vitest";
import { isFounder, founderEmails } from "./founder";

const prev = process.env.FOUNDER_EMAILS;
afterEach(() => { if (prev === undefined) delete process.env.FOUNDER_EMAILS; else process.env.FOUNDER_EMAILS = prev; });

describe("founder gate", () => {
  it("nobody is a founder when the list is unset", () => {
    delete process.env.FOUNDER_EMAILS;
    expect(founderEmails()).toEqual([]);
    expect(isFounder("anyone@example.com")).toBe(false);
    expect(isFounder("")).toBe(false);
  });
  it("matches the configured addresses case-insensitively and nothing else", () => {
    process.env.FOUNDER_EMAILS = " Karim@Example.com , second@example.com";
    expect(isFounder("karim@example.com")).toBe(true);
    expect(isFounder("SECOND@example.com")).toBe(true);
    expect(isFounder("karim@example.com.evil")).toBe(false);
    expect(isFounder(null)).toBe(false);
  });
});
