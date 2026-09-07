import { describe, it, expect } from "vitest";
import { firstName } from "./utils";

describe("firstName", () => {
  it("greets by first name, but never truncates a phone number, email or handle", () => {
    expect(firstName("Maya Chen")).toBe("Maya");
    expect(firstName("(512) 555-0148")).toBe("(512) 555-0148");
    expect(firstName("+15125550148")).toBe("+15125550148");
    expect(firstName("jordan@northloop.co")).toBe("jordan@northloop.co");
    expect(firstName("")).toBe("there");
    expect(firstName(null, "this lead")).toBe("this lead");
  });
});
