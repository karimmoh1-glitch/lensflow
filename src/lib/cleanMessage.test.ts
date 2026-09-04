import { describe, it, expect } from "vitest";
import { splitMessage, previewOf } from "./cleanMessage";

const GMAIL_REPLY = `The location will be at Redmond Town Center. My budget is $500, and I want this done for my newborn child.

On Sun, Aug 30, 2026 at 4:35 PM Alex Rivera <alex@demo.lensflow.app> wrote:
> Hi Ahmed! Thanks for reaching out. Where were you thinking, and what's your budget?
>
> On Sat, Aug 29, 2026 Ahmed Mantawy <ahmed@example.com> wrote:
> > Hi, are you available for a session in September?`;

describe("splitMessage", () => {
  it("keeps the new content and moves the Gmail quote chain aside", () => {
    const r = splitMessage(GMAIL_REPLY);
    expect(r.text).toBe("The location will be at Redmond Town Center. My budget is $500, and I want this done for my newborn child.");
    expect(r.quoted).toMatch(/^On Sun, Aug 30/);
    expect(r.quoted).toContain("are you available for a session");
    expect(r.changed).toBe(true);
  });

  it("handles Outlook 'Original Message' and From/Sent/To header blocks", () => {
    const a = splitMessage("Thursday works! Can we do 3pm?\n\n-----Original Message-----\nFrom: Alex\nSent: Monday\nTo: Sarah\nSubject: Re: session\nHow about Thursday?");
    expect(a.text).toBe("Thursday works! Can we do 3pm?");
    expect(a.quoted).toContain("How about Thursday?");
    const b = splitMessage("Yes please.\n\nFrom: Alex Rivera\nSent: Monday, August 31\nTo: Sarah Kim\nSubject: Re: booking\n\nWant to lock it in?");
    expect(b.text).toBe("Yes please.");
  });

  it("strips signatures only when they are short and trailing", () => {
    const r = splitMessage("Can you do Saturday at noon?\n\nThanks,\nSarah Kim\n555-0148\nsarah@example.com");
    expect(r.text).toBe("Can you do Saturday at noon?");
    expect(r.signature).toBe("Thanks,\nSarah Kim\n555-0148\nsarah@example.com");
    // a "Thanks" followed by a long real message is not a signature
    const long = splitMessage("Thanks,\n" + Array.from({ length: 12 }, (_, i) => `line ${i} of an actual message`).join("\n"));
    expect(long.signature).toBeNull();
  });

  it("drops mobile footers, disclaimers and tracking links but never returns empty", () => {
    const r = splitMessage("Running 10 late!!\n\nSent from my iPhone");
    expect(r.text).toBe("Running 10 late!!");
    const d = splitMessage("Please see the quote attached.\n\nThis email and any attachments are confidential and intended solely for the addressee.");
    expect(d.text).toBe("Please see the quote attached.");
    const l = splitMessage("Here: https://example.com/track/" + "a".repeat(80) + "?utm_source=x");
    expect(l.text).toBe("Here: [example.com link]");
    const q = splitMessage("> only a quote\n> nothing else");
    expect(q.text.length).toBeGreaterThan(0);
  });

  it("previewOf is one line and capped", () => {
    expect(previewOf(GMAIL_REPLY, 40)).toBe("The location will be at Redmond Town Ce…");
    expect(previewOf("a\n\n\nb")).toBe("a b");
  });
});
