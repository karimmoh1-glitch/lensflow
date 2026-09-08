import { describe, it, expect } from "vitest";
import { scrub } from "./observe";

describe("scrub", () => {
  it("removes an OpenAI key, including the masked form the provider echoes back in a 401", () => {
    const masked = scrub("401 Incorrect API key provided: sk-inval*********************************only. You can find your API key at https://platform.openai.com/account/api-keys.");
    expect(masked).not.toMatch(/sk-inval/);
    expect(masked).not.toMatch(/only\./);
    expect(masked).toContain("[redacted]");
    expect(scrub("key sk-proj-AbCd1234EfGh5678IjKl")).not.toMatch(/AbCd1234/);
  });

  it("still removes the other providers' shapes", () => {
    expect(scrub("sk_live_abc123DEF")).toBe("[redacted]");
    expect(scrub("whsec_abc123")).toBe("[redacted]");
    expect(scrub("Authorization: Bearer ya29.a0AfH6")).toBe("Authorization: Bearer [redacted]");
    expect(scrub("refresh_token=1//abc&x=1")).not.toMatch(/1\/\/abc/);
  });

  it("leaves an ordinary message readable and caps its length", () => {
    expect(scrub("OpenAI did not answer within the timeout.")).toBe("OpenAI did not answer within the timeout.");
    expect(scrub("x".repeat(900))).toHaveLength(500);
  });
});
