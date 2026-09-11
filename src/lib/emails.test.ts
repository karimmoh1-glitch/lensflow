import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderEmail, invitationEmail, passwordResetEmail, fileDeliveryEmail, linkTo } from "@/lib/emails";

/**
 * These go to real customers under a business's name, so the things that matter are: the
 * link works, the words are the same in both parts, and nothing a person typed can escape
 * into the markup. Delivery itself is covered next door in transactionalEmail.test.ts —
 * this is about what is in the envelope.
 */
describe("transactional email content", () => {
  const original = process.env.NEXT_PUBLIC_APP_URL;
  beforeEach(() => { process.env.NEXT_PUBLIC_APP_URL = "https://daythread.org"; });
  afterEach(() => { process.env.NEXT_PUBLIC_APP_URL = original; });

  it("builds absolute links, never a relative one and never `undefined`", () => {
    expect(linkTo("/invite/abc")).toBe("https://daythread.org/invite/abc");
    expect(linkTo("invite/abc")).toBe("https://daythread.org/invite/abc");
    process.env.NEXT_PUBLIC_APP_URL = "https://daythread.org/";
    expect(linkTo("/invite/abc")).toBe("https://daythread.org/invite/abc");
    // The old code read the variable inline, so losing it posted `undefined/invite/…` to a
    // real person. Now the worst case is a working local URL.
    delete process.env.NEXT_PUBLIC_APP_URL;
    expect(linkTo("/invite/abc")).not.toContain("undefined");
    expect(linkTo("/invite/abc")).toMatch(/^https?:\/\//);
  });

  it("says the same thing in the text part and the HTML part", () => {
    const mail = invitationEmail({ businessName: "Rivera Studio", recipientName: "Sam", token: "tok123", role: "client" });
    for (const part of [mail.text, mail.html]) {
      expect(part).toContain("Rivera Studio");
      expect(part).toContain("https://daythread.org/invite/tok123");
    }
    expect(mail.subject).toContain("Rivera Studio");
    // The link is also written out, because a button is not clickable in every client.
    expect(mail.html).toContain("Or paste this into your browser");
  });

  it("escapes anything a person typed, so a business name cannot inject markup", () => {
    const mail = invitationEmail({ businessName: '<script>alert("x")</script> & Co', recipientName: "Sam", token: "t", role: "teammate" });
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain("&lt;script&gt;");
    expect(mail.html).toContain("&amp; Co");
  });

  it("escapes a customer's own message in a delivery note", () => {
    const mail = fileDeliveryEmail({ businessName: "Studio", recipientName: "Dana", url: "https://drive.google.com/x", message: '<img src=x onerror="steal()">' });
    expect(mail.html).not.toContain("<img");
    expect(mail.html).toContain("&lt;img");
  });

  it("a password reset points at the page that accepts the token", () => {
    const mail = passwordResetEmail({ name: "Sam", token: "reset-tok" });
    expect(mail.text).toContain("https://daythread.org/reset-password/reset-tok");
    expect(mail.html).toContain("https://daythread.org/reset-password/reset-tok");
    // It says what will happen, including that doing nothing is safe.
    expect(mail.text.toLowerCase()).toContain("expires in an hour");
    expect(mail.text.toLowerCase()).toContain("did not ask for this");
  });

  it("tells each kind of invitee what they are being given", () => {
    const client = invitationEmail({ businessName: "Studio", recipientName: "Dana", token: "t", role: "client" });
    const teammate = invitationEmail({ businessName: "Studio", recipientName: "Lee", token: "t", role: "teammate" });
    const partner = invitationEmail({ businessName: "Studio", recipientName: "Kim", token: "t", role: "partner" });
    expect(client.text).toMatch(/bookings, messages and any files/i);
    expect(teammate.text).toMatch(/share their inbox/i);
    expect(partner.text).toMatch(/assigned to you/i);
    // Three different people, three different explanations.
    expect(new Set([client.text, teammate.text, partner.text]).size).toBe(3);
  });

  it("a reminder reads as a reminder rather than a second invitation", () => {
    const first = invitationEmail({ businessName: "Studio", recipientName: "Dana", token: "t", role: "client" });
    const again = invitationEmail({ businessName: "Studio", recipientName: "Dana", token: "t", role: "client", reminder: true });
    expect(again.subject).toMatch(/^Reminder/);
    expect(again.subject).not.toBe(first.subject);
  });

  it("carries no secret beyond the single-use token it is about", () => {
    const mail = invitationEmail({ businessName: "Studio", recipientName: "Dana", token: "invite-token", role: "client" });
    const whole = `${mail.subject}\n${mail.text}\n${mail.html}`;
    for (const pattern of [/sk_live/i, /sk_test/i, /Bearer /, /refresh_token/i, /client_secret/i, /password/i]) {
      // "password" is allowed only in the reset email, which is about one.
      expect(whole).not.toMatch(pattern);
    }
  });

  it("renders a message with no call to action without leaving an empty button", () => {
    const mail = renderEmail({ subject: "Just so you know", preview: "A note.", heading: "A note", body: ["Nothing to do here."], from: "Studio" });
    expect(mail.html).not.toContain("<a href");
    expect(mail.text).toContain("Nothing to do here.");
  });

  it("is built for a phone screen", () => {
    const mail = fileDeliveryEmail({ businessName: "Studio", recipientName: "Dana", url: "https://drive.google.com/x" });
    expect(mail.html).toContain('name="viewport"');
    expect(mail.html).toContain("max-width:600px");
    // Every style is inline, because a mail client will strip a stylesheet.
    expect(mail.html).not.toContain("<style");
  });
});
