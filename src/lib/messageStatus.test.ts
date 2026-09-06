import { describe, it, expect } from "vitest";
import { messageState } from "./messageStatus";

/**
 * What the thread tells a business owner about a message they sent. The rule this enforces:
 * a message that did not leave is never described as if it did, and the reason it did not
 * leave is the real one — not "this channel isn't connected" for every case.
 */
const out = (over: Partial<Parameters<typeof messageState>[0]> = {}) => ({ direction: "OUTBOUND" as const, status: "SENT" as const, statusDetail: null, deliveredAt: null, readAt: null, ...over });

describe("messageState", () => {
  it("says nothing about an inbound message", () => {
    expect(messageState({ direction: "INBOUND", status: "SENT" }, "WHATSAPP")).toMatchObject({ tone: "none", label: null });
  });

  it("distinguishes sent, delivered and read from the provider's own receipts", () => {
    expect(messageState(out({ status: "SENT", statusDetail: "accepted" }), "WHATSAPP").label).toBe("Sent");
    // On a channel with no receipts, "Sent" adds nothing to a message already in the thread.
    expect(messageState(out({ status: "SENT", statusDetail: "accepted" }), "EMAIL").label).toBeNull();
    expect(messageState(out({ status: "SENT", statusDetail: "accepted" }), "INSTAGRAM").label).toBeNull();
    expect(messageState(out({ status: "DELIVERED", statusDetail: "delivered", deliveredAt: new Date() }), "WHATSAPP")).toMatchObject({ tone: "delivered", label: "Delivered" });
    expect(messageState(out({ status: "DELIVERED", statusDetail: "read", deliveredAt: new Date(), readAt: new Date() }), "WHATSAPP")).toMatchObject({ tone: "read", label: "Read" });
  });

  it("explains the WhatsApp window instead of claiming the channel isn't connected", () => {
    const s = messageState(out({ status: "NOT_DELIVERED", statusDetail: "window_closed" }), "WHATSAPP");
    expect(s.tone).toBe("warning");
    expect(s.label).toBe("Not delivered");
    expect(s.detail).toMatch(/24 hours/);
    expect(s.detail).not.toMatch(/isn't connected/i);
  });

  it("names a reconnect, a missing connection and a rejection separately", () => {
    expect(messageState(out({ status: "NOT_DELIVERED", statusDetail: "reauth_required" }), "INSTAGRAM").detail).toMatch(/reconnected/i);
    expect(messageState(out({ status: "NOT_DELIVERED", statusDetail: "not_connected" }), "INSTAGRAM").detail).toMatch(/isn't connected/i);
    expect(messageState(out({ status: "FAILED", statusDetail: "provider_rejected" }), "INSTAGRAM")).toMatchObject({ tone: "danger", label: "Failed to send" });
  });

  it("reads Meta's own failure code back as the window rule", () => {
    // What the WhatsApp status webhook stores when Meta refuses a re-engagement message.
    const s = messageState(out({ status: "FAILED", statusDetail: "131047 Re-engagement message" }), "WHATSAPP");
    expect(s.tone).toBe("danger");
    expect(s.detail).toMatch(/24-hour customer service window/);
  });

  it("still says something useful when the detail is missing (older rows)", () => {
    expect(messageState(out({ status: "NOT_DELIVERED", statusDetail: null }), "SMS").detail).toMatch(/did not deliver/i);
    expect(messageState(out({ status: "FAILED", statusDetail: null }), "EMAIL").detail).toMatch(/rejected/i);
  });
});
