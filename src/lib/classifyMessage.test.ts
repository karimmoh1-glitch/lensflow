import { describe, it, expect } from "vitest";
import { classifyMessage, type ClassifyInput } from "./classifyMessage";

const email = (o: Partial<ClassifyInput> & { body: string }): ClassifyInput => ({ channel: "EMAIL", ...o });

/** Realistic fixtures: what actually lands in a small business's inbox. */
export const FIXTURES: Array<{ name: string; input: ClassifyInput; expect: ClassifyInput extends never ? never : "PRIORITY" | "AUTOMATED" | "PROMOTIONAL" | "VENDOR" | "INTERNAL" | "SPAM" }> = [
  // ── Automated ──
  { name: "DoorDash confirmation", expect: "AUTOMATED", input: email({ senderEmail: "no-reply@doordash.com", senderName: "DoorDash", subject: "Your order has been confirmed", body: "Your DoorDash order from Thai Basil is confirmed and on its way. Estimated arrival 7:40 PM." }) },
  { name: "Amazon receipt", expect: "AUTOMATED", input: email({ senderEmail: "auto-confirm@amazon.com", senderName: "Amazon.com", subject: "Your Amazon.com order #114-2233445-6677889", body: "Order Confirmation. Your package with 1 item will arrive Thursday. Track your package." }) },
  { name: "Stripe payout (platform)", expect: "VENDOR", input: email({ senderEmail: "receipts@stripe.com", senderName: "Stripe", subject: "Your Stripe payout of $312.00", body: "A payout was sent to your bank account ending in 4411." }) },
  { name: "Google security alert (platform)", expect: "VENDOR", input: email({ senderEmail: "no-reply@accounts.google.com", senderName: "Google", subject: "Security alert", body: "A new sign-in on Mac. If this was you, you can ignore this." }) },
  { name: "Calendly notification (platform)", expect: "VENDOR", input: email({ senderEmail: "notifications@calendly.com", senderName: "Calendly", subject: "New Event: 30 Minute Meeting with Dana", body: "A new event has been scheduled. This is an automated message." }) },
  { name: "Zoom notification (platform)", expect: "VENDOR", input: email({ senderEmail: "no-reply@zoom.us", senderName: "Zoom", subject: "Cloud recording is now available", body: "Your cloud recording is now available. Do not reply to this email." }) },
  { name: "Calendar confirmation from an unknown domain", expect: "AUTOMATED", input: email({ senderEmail: "calendar-notification@scheduling.example.net", subject: "Accepted: Portrait session @ Fri Sep 12", body: "This invitation has been accepted. This is an automated message." }) },
  { name: "Shipping notification", expect: "AUTOMATED", input: email({ senderEmail: "tracking@shipnotify.example.com", subject: "Your package has shipped", body: "Tracking number 1Z999AA10123456784. Estimated delivery: Thursday." }) },
  { name: "Password reset from unknown SaaS", expect: "AUTOMATED", input: email({ senderEmail: "noreply@someapp.io", subject: "Reset your password", body: "Click the link below to reset your password. If you did not request this, ignore this email." }) },
  { name: "Auto-Submitted header", expect: "AUTOMATED", input: email({ senderEmail: "bot@somewhere.example", subject: "Ticket #4821 updated", body: "Your ticket was updated.", headers: { autoSubmitted: "auto-generated" } }) },
  { name: "Software notification, subscription", expect: "AUTOMATED", input: email({ senderEmail: "billing@cloudapp.example", subject: "Your subscription has been renewed", body: "Your plan renewed for $12. Manage your notification preferences." }) },
  // ── Promotional ──
  { name: "Newsletter with List-Unsubscribe", expect: "PROMOTIONAL", input: email({ senderEmail: "news@lensmag.example", subject: "Weekly digest: 5 lighting setups under $100", body: "Plus a 20% off code for members. Unsubscribe any time.", headers: { listUnsubscribe: "<mailto:u@lensmag.example>", listId: "<weekly.lensmag.example>" } }) },
  { name: "Marketing email, Mailchimp infrastructure", expect: "PROMOTIONAL", input: email({ senderEmail: "hello@brandshop.example", subject: "Flash sale ends tonight", body: "Save up to 40% on everything. View in browser. You are receiving this because you signed up.", headers: { messageId: "<abc@mail123.mcsv.net>" } }) },
  { name: "Mailing-list email (Precedence: list)", expect: "PROMOTIONAL", input: email({ senderEmail: "community@makers.example", subject: "Issue #42: what we shipped", body: "This month in the community. Manage preferences.", headers: { precedence: "list" } }) },
  // ── Business ──
  { name: "New inquiry from a personal address", expect: "PRIORITY", input: email({ senderEmail: "sarah.johnson@gmail.com", senderName: "Sarah Johnson", subject: "Graduation pictures", body: "Hi! Are you available for graduation pictures June 14? I'd love to book if so!" }) },
  { name: "Existing customer, even with a subject that looks transactional", expect: "PRIORITY", input: email({ senderEmail: "priya@example.com", subject: "Your order — invoice question", body: "Can you resend the invoice for last month?", knownCustomer: true }) },
  { name: "Returning sender you replied to before", expect: "PRIORITY", input: email({ senderEmail: "jordan@lee.example", subject: "Re: session", body: "Thursday works! Can we do 3pm?", priorOutbound: true }) },
  { name: "Reply thread from a new person", expect: "PRIORITY", input: email({ senderEmail: "m.chen@outlook.com", subject: "Re: pricing", body: "Thanks — what does the half day include?" }) },
  { name: "Vendor invoice", expect: "VENDOR", input: email({ senderEmail: "accounts@printlab.example", senderName: "PrintLab Accounts", subject: "Invoice #10432 for your recent order", body: "Please find attached invoice #10432. Payment terms net 30." }) },
  { name: "Vendor sales pitch from a business domain", expect: "VENDOR", input: email({ senderEmail: "sales@studiorentals.example", subject: "Partnership: studio space for photographers", body: "We'd love to offer your clients a discount on studio rentals. Let us know if you're interested." }) },
  { name: "Internal employee (your own domain)", expect: "INTERNAL", input: email({ senderEmail: "dana@alexrivera.example", senderName: "Dana", subject: "Saturday coverage", body: "Can you cover the 2pm on Saturday? I'm double-booked.", businessDomains: ["alexrivera.example"] }) },
  { name: "Shared mailbox at a real business asking a question", expect: "PRIORITY", input: email({ senderEmail: "hello@brightco.example", senderName: "Bright Co", subject: "Headshots for our team", body: "Hi! Do you do team headshots? We have 12 people and are looking for a date in October." }) },
  { name: "Shared mailbox with no ask", expect: "VENDOR", input: email({ senderEmail: "info@somebusiness.example", subject: "Our new location", body: "We have moved to 123 Main St. Our hours remain the same." }) },
  // ── Edge cases ──
  { name: "No-reply sender from unknown domain", expect: "AUTOMATED", input: email({ senderEmail: "noreply@bookingtool.example", subject: "Booking request received", body: "We received your booking request." }) },
  { name: "Forwarded message from a person", expect: "PRIORITY", input: email({ senderEmail: "tom.r@yahoo.com", subject: "Fwd: our wedding", body: "Hi, forwarding this from my fiancée — are you free Sept 20? ---------- Forwarded message ---------" }) },
  { name: "Reply chain with quoted history", expect: "PRIORITY", input: email({ senderEmail: "ahmed@example.com", subject: "Re: newborn session", body: "The location will be at Redmond Town Center. My budget is $500.\n\nOn Sun, Aug 30, 2026 at 4:35 PM Alex wrote:\n> Where were you thinking?" }) },
  { name: "Long signature, real message", expect: "PRIORITY", input: email({ senderEmail: "kate@katedesigns.example", subject: "Brand photos", body: "Hi Alex, I'd like to book a brand session for my studio next month.\n\nBest,\nKate Morgan\nFounder, Kate Designs\n555-0199\nkatedesigns.example" }) },
  { name: "Marketing email without list headers", expect: "PROMOTIONAL", input: email({ senderEmail: "team@courseplatform.example", subject: "Last chance: 50% off the lighting masterclass", body: "Ends tonight. Don't miss it. Unsubscribe." }) },
  { name: "Mixed: customer address, but a bulk newsletter from their side", expect: "PROMOTIONAL", input: email({ senderEmail: "priya@example.com", subject: "Priya's monthly newsletter", body: "Here's what's new this month. Unsubscribe.", knownCustomer: true, headers: { listUnsubscribe: "<mailto:x>" } }) },
  { name: "Junk", expect: "SPAM", input: email({ senderEmail: "winner@lucky.example", subject: "Congratulations you have won", body: "Claim your prize now via wire transfer." }) },
  { name: "Instagram DM is always a person", expect: "PRIORITY", input: { channel: "INSTAGRAM", senderName: "@maya", body: "hey are you free tuesday?" } },
  { name: "SMS is always a person", expect: "PRIORITY", input: { channel: "SMS", senderName: "+15125550148", body: "anything open next week?" } },
  { name: "Plain short note with no ask is still a person", expect: "PRIORITY", input: email({ senderEmail: "leo@studio.example", subject: "hey", body: "Loved the last shoot. Talk soon." }) },
];

describe("classifyMessage fixtures", () => {
  for (const f of FIXTURES) {
    it(f.name, () => {
      const r = classifyMessage(f.input);
      expect(r.category, `${f.name}: ${r.reason} [${r.signals.join(", ")}]`).toBe(f.expect);
      expect(r.reason.length).toBeGreaterThan(0);
    });
  }
});

describe("classifyMessage layers", () => {
  it("tenant rules win over everything, and only this tenant's rules are consulted", () => {
    const r = classifyMessage(email({ senderEmail: "no-reply@doordash.com", subject: "Your order", body: "Confirmed.", rules: [{ kind: "domain", value: "doordash.com", category: "PRIORITY" }] }));
    expect(r.category).toBe("PRIORITY");
    expect(r.decidedBy).toBe("rule");
    const none = classifyMessage(email({ senderEmail: "no-reply@doordash.com", subject: "Your order", body: "Confirmed.", rules: [] }));
    expect(none.category).toBe("AUTOMATED");
  });
  it("an exact email rule beats a domain rule", () => {
    const r = classifyMessage(email({ senderEmail: "dana@brightco.example", body: "Hi", rules: [{ kind: "domain", value: "brightco.example", category: "VENDOR" }, { kind: "email", value: "dana@brightco.example", category: "PRIORITY" }] }));
    expect(r.category).toBe("PRIORITY");
  });
  it("relationship history beats sender heuristics", () => {
    const r = classifyMessage(email({ senderEmail: "notifications@bigcorp.example", subject: "Your appointment", body: "Confirming Friday.", knownCustomer: true }));
    expect(r.category).toBe("PRIORITY");
    expect(r.decidedBy).toBe("relationship");
  });
  it("reports signals so the UI can explain itself", () => {
    const r = classifyMessage(email({ senderEmail: "no-reply@doordash.com", subject: "Your order has been confirmed", body: "This is an automated message." }));
    expect(r.signals).toContain("domain:consumer:doordash.com");
    expect(r.signals).toContain("sender:no-reply@");
    expect(r.reason).toBe("Transactional notification from Doordash.");
  });
});
