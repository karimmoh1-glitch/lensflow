import { describe, it, expect } from "vitest";
import { buildRequest, extractionUserMessage, draftTurns, assistantUserMessage, summaryTranscript, extractLeadInfoByRules } from "./ai";
import { AI_INPUT_CHAR_LIMIT, AI_MODEL, MAX_TOKENS } from "./aiPolicy";

/**
 * These assert the real request object the SDK is handed, not a stand-in: buildRequest is
 * the same function callModel uses, so a cap or a truncation that regressed here would
 * regress in production.
 */
const HUGE = "z".repeat(50_000);

describe("every request carries its output cap", () => {
  it("extraction: 200, JSON mode, on the pinned model", () => {
    const r = buildRequest("extraction", { system: "s", user: "u", temperature: 0, responseFormat: "json_object" });
    expect(r.max_tokens).toBe(MAX_TOKENS.extraction);
    expect(r.model).toBe(AI_MODEL);
    expect(r.response_format).toEqual({ type: "json_object" });
    expect(r.messages.map((m) => m.role)).toEqual(["system", "user"]);
  });

  it("draft: 300", () => {
    expect(buildRequest("draft", { system: "s", user: "u", temperature: 0.4 }).max_tokens).toBe(300);
    expect(buildRequest("agent_draft", { system: "s", user: "u", temperature: 0.4 }).max_tokens).toBe(300);
  });

  it("assistant: 500, summary: 100", () => {
    expect(buildRequest("assistant", { system: "s", user: "u", temperature: 0.2 }).max_tokens).toBe(500);
    expect(buildRequest("summary", { system: "s", user: "u", temperature: 0.1 }).max_tokens).toBe(100);
    expect(buildRequest("summary_forced", { system: "s", user: "u", temperature: 0.1 }).max_tokens).toBe(100);
  });

  it("no request omits a cap or JSON mode it did not ask for", () => {
    const r = buildRequest("draft", { system: "s", user: "u", temperature: 0.4 });
    expect(r).not.toHaveProperty("response_format");
    expect(typeof r.max_tokens).toBe("number");
  });
});

describe("customer text is truncated before it is sent", () => {
  it("extraction keeps the JSON instruction intact after a huge message", () => {
    const user = extractionUserMessage(HUGE);
    expect(user.length).toBeLessThan(AI_INPUT_CHAR_LIMIT + 400);
    expect(user).toContain("Respond as JSON");
    expect(user).toContain("[…]");
    // The quoted block is closed, so the structure the prompt relies on survives.
    expect(user.match(/"""/g)).toHaveLength(2);
  });

  it("a draft truncates the customer message, not the services or the instructions", () => {
    const turns = draftTurns({
      businessName: "Alex Rivera Photography",
      services: [{ name: "Portrait session", priceCents: 20000, durationMins: 60 }],
      customerMessage: HUGE,
      customerName: "Sarah",
    });
    expect(turns.user.length).toBeLessThan(AI_INPUT_CHAR_LIMIT + 200);
    expect(turns.user).toContain("(Sarah)");
    expect(turns.user.match(/"""/g)).toHaveLength(2);
    expect(turns.system).toContain("Portrait session: $200 (60 min)");
    expect(turns.system).toContain("under 80 words");
  });

  it("the assistant caps the question and the fact sheet separately", () => {
    const user = assistantUserMessage("q".repeat(5_000), HUGE);
    expect(user).toContain("Question:");
    expect(user).toContain("Facts:");
    expect(user.length).toBeLessThan(1_000 + AI_INPUT_CHAR_LIMIT + 100);
  });

  it("the transcript keeps its own twelve-message rule and the overall cap", () => {
    const messages = Array.from({ length: 40 }, (_, i) => ({ direction: (i % 2 === 0 ? "INBOUND" : "OUTBOUND") as "INBOUND" | "OUTBOUND", body: `message ${i} ` + "y".repeat(2_000) }));
    const transcript = summaryTranscript({ personName: "Sarah", businessName: "Alex", messages });
    expect(transcript.length).toBeLessThanOrEqual(AI_INPUT_CHAR_LIMIT);
    // The oldest messages are dropped by the twelve-message window, so the newest survive.
    expect(transcript).not.toContain("message 0 ");
    expect(transcript).toContain("message 39");
  });

  it("a normal message is passed through unchanged", () => {
    const turns = draftTurns({ businessName: "B", services: [], customerMessage: "Do you shoot weddings in June?", customerName: null });
    expect(turns.user).toContain('"""Do you shoot weddings in June?"""');
    expect(turns.user).not.toContain("[…]");
  });
});

describe("the rule extractor", () => {
  it("reads a place, not a month, from \"in September\"", () => {
    expect(extractLeadInfoByRules("Following up on pricing for a shoot in September. Around $800 is our budget.").location).toBeNull();
    expect(extractLeadInfoByRules("We'd love to do them at Marymoor Park.").location).toBe("Marymoor Park");
    expect(extractLeadInfoByRules("Can we meet at noon?").location).toBeNull();
  });
});

