import { describe, it, expect } from "vitest";
import { classifyMessage } from "./classifyMessage";

const email = (over: Partial<Parameters<typeof classifyMessage>[0]>) =>
  classifyMessage({ channel: "EMAIL", body: "", ...over });

describe("classifyMessage", () => {
  it("does not treat a DoorDash confirmation as a customer", () => {
    const r = email({ senderEmail: "no-reply@doordash.com", subject: "Your order has been confirmed", body: "Your DoorDash order from Thai Basil is confirmed." });
    expect(r.category).toBe("AUTOMATED");
  });
  it("treats no-reply addresses as automated even from unknown domains", () => {
    expect(email({ senderEmail: "noreply@somestore.example", subject: "Thanks for your purchase", body: "Order #4411" }).category).toBe("AUTOMATED");
    expect(email({ senderEmail: "do-not-reply@bank.example", subject: "Security alert", body: "A new sign-in." }).category).toBe("AUTOMATED");
  });
  it("routes newsletters and marketing to promotional", () => {
    expect(email({ senderEmail: "news@brand.example", subject: "Weekly digest", body: "Unsubscribe here.", headers: { listUnsubscribe: "<mailto:x>" } }).category).toBe("PROMOTIONAL");
    expect(email({ senderEmail: "jane@shop.example", subject: "50% off everything this weekend", body: "Shop now." }).category).toBe("PROMOTIONAL");
  });
  it("routes platform mail to internal", () => {
    expect(email({ senderEmail: "receipts@stripe.com", subject: "Your Stripe payout", body: "" }).category).toBe("INTERNAL");
    expect(email({ senderEmail: "no-reply@accounts.google.com", subject: "Security alert", body: "" }).category).toBe("INTERNAL");
  });
  it("keeps a real customer inquiry as priority", () => {
    const r = email({ senderEmail: "sarah.kim@gmail.com", senderName: "Sarah Kim", subject: "Question", body: "Hey! Do you have anything available Friday afternoon?" });
    expect(r.category).toBe("PRIORITY");
  });
  it("keeps a known customer as priority even with a receipt-like subject", () => {
    expect(email({ senderEmail: "jordan@northloop.co", subject: "Re: invoice for last month", body: "Can you resend it?", knownCustomer: true }).category).toBe("PRIORITY");
  });
  it("treats a shared mailbox asking a question as priority, and one that isn't as internal", () => {
    expect(email({ senderEmail: "hello@venue.example", body: "Hi — are you available to shoot our launch on the 12th? What would it cost?" }).category).toBe("PRIORITY");
    expect(email({ senderEmail: "info@printer.example", body: "Your proof is attached for review." }).category).toBe("INTERNAL");
  });
  it("never demotes person-to-person channels", () => {
    expect(classifyMessage({ channel: "INSTAGRAM", body: "ok", senderName: "@x" }).category).toBe("PRIORITY");
    expect(classifyMessage({ channel: "SMS", body: "running 10 late", senderName: "+1" }).category).toBe("PRIORITY");
  });
  it("flags obvious junk", () => {
    expect(email({ senderEmail: "x@y.example", subject: "Congratulations you have won", body: "Claim your prize via wire transfer" }).category).toBe("SPAM");
  });
  it("defaults an ordinary human note to priority", () => {
    expect(email({ senderEmail: "amir@gmail.com", body: "Thanks again for yesterday." }).category).toBe("PRIORITY");
  });
});
