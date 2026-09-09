import { describe, it, expect } from "vitest";
import { normalizeEmailContent } from "./emailNormalize";
import { isAcknowledgement, splitMessage, previewOf } from "./cleanMessage";

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

describe("the attribution line, however the client wraps it", () => {
  it("removes a Gmail header broken before \"wrote:\" — the shape a real reply arrives in", () => {
    const raw = [
      "The location will be at Redmond Town Center. My budget is $500, and I want this done for my newborn child.",
      "",
      "On Sun, Aug 30, 2026 at 4:35 PM karim photography <karimamwa@gmail.com>",
      "wrote:",
      "",
      "> Hi there, thanks for reaching out about a session.",
      "> Let me know what you had in mind.",
    ].join("\n");
    const r = splitMessage(raw);
    expect(r.text).toBe("The location will be at Redmond Town Center. My budget is $500, and I want this done for my newborn child.");
    expect(r.text).not.toMatch(/wrote:|On Sun|@gmail\.com/);
    expect(r.quoted).toContain("thanks for reaching out");
    expect(r.changed).toBe(true);
  });

  it("removes it on one line too, and with a long display name", () => {
    const oneLine = "Thanks!\n\nOn Sun, Aug 30, 2026 at 4:35 PM Karim <k@g.com> wrote:\n\n> earlier";
    expect(splitMessage(oneLine).text).toBe("Thanks!");
    const longName = `Sounds good.\n\nOn Mon, Sep 1, 2026 at 9:02 AM ${"Very Long Studio Name ".repeat(5)}<studio@example.com>\nwrote:\n\n> earlier`;
    expect(splitMessage(longName).text).toBe("Sounds good.");
  });

  it("removes a single quoted line, not just a run of them", () => {
    const one = "Yes, Saturday works.\n\n> Are you free Saturday?";
    const r = splitMessage(one);
    expect(r.text).toBe("Yes, Saturday works.");
    expect(r.quoted).toBe("> Are you free Saturday?");
  });

  it("keeps a sentence that merely contains the word wrote", () => {
    const raw = "I wrote: please bring the contract. Also, can we start at 3?";
    expect(splitMessage(raw).text).toBe(raw);
  });

  it("never empties a message that is only a quote", () => {
    const onlyQuote = "On Sun, Aug 30, 2026 at 4:35 PM Karim <k@g.com>\nwrote:\n\n> the whole thing";
    expect(splitMessage(onlyQuote).text.length).toBeGreaterThan(0);
  });

  it("leaves the other localized headers working when they wrap", () => {
    expect(splitMessage("D'accord.\n\nLe dim. 30 août 2026 à 16:35, Karim <k@g.com>\na écrit :\n\n> avant").text).toBe("D'accord.");
    expect(splitMessage("Gut.\n\nAm So., 30. Aug. 2026 um 16:35 Uhr schrieb Karim <k@g.com>:\n\n> vorher").text).toBe("Gut.");
  });
});

describe("the noise a real inbox carries", () => {
  it("HTML mail is text by the time it is split, and the quote still comes off", () => {
    const html = "<div dir=\"ltr\">Can you do a <b>newborn</b> session on <span>Oct 12</span>? Budget is $500.</div><br><div class=\"gmail_quote\">On Sun, Aug 30, 2026 at 4:35 PM karim photography &lt;k@g.com&gt;<br>wrote:<br><blockquote>Thanks for reaching out!</blockquote></div>";
    const text = normalizeEmailContent({ text: null, html });
    // Tags are gone; an address in angle brackets is not a tag.
    expect(text).not.toMatch(/<(div|b|span|br|blockquote)\b/i);
    const r = splitMessage(text);
    expect(r.text).toContain("newborn session on Oct 12");
    expect(r.text).toContain("$500");
    expect(r.text).not.toMatch(/wrote:|Thanks for reaching out/);
  });

  it("an unsubscribe block and a legal disclaimer come off; the ask stays", () => {
    const raw = "Hi! Do you shoot weddings in June? We're at $3,000.\n\nThis e-mail and any attachments are confidential and intended solely for the addressee.\n\nUnsubscribe | Manage preferences | View in browser";
    const r = splitMessage(raw);
    expect(r.text).toContain("Do you shoot weddings in June?");
    expect(r.text).toContain("$3,000");
    expect(r.text).not.toMatch(/confidential|Unsubscribe|Manage preferences|View in browser/i);
  });

  it("a signature that adds nothing comes off, but a sign-off inside a real message does not eat it", () => {
    const withSig = "Sounds great, see you Saturday at 2.\n\nBest,\nSarah Johnson\n555-0148\nsarah@example.com";
    const r = splitMessage(withSig);
    expect(r.text).toBe("Sounds great, see you Saturday at 2.");
    expect(r.signature).toContain("Sarah Johnson");
    const midway = "Thanks for the quote. One more question: can we start at 3 instead of 2? Also the venue moved to Kirkland.";
    expect(splitMessage(midway).text).toBe(midway);
  });

  it("a reply on top of a twice-quoted chain keeps only the new sentence", () => {
    const raw = "Yes, October 12 works for us.\n\nOn Mon, Sep 1, 2026 at 9:02 AM Studio <s@x.com>\nwrote:\n\n> Would the 12th or the 19th suit you?\n>\n> On Sun, Aug 31, 2026 at 5:00 PM Sarah <sarah@example.com> wrote:\n>> We're looking at mid-October.";
    const r = splitMessage(raw);
    expect(r.text).toBe("Yes, October 12 works for us.");
    expect(r.quoted).toContain("mid-October");
  });

  it("a short message and a long one both keep every fact that changes what the owner does", () => {
    const short = "Are you free Oct 12?";
    expect(splitMessage(short).text).toBe(short);
    const long = ["Hello,", "", "We're planning a family session for 6 people at Marymoor Park on October 12 around sunset.", "Our budget is $500 and we need the photos by November 1 for holiday cards.", "Can you let me know availability and whether you offer prints?", "", "Thanks,", "Maria"].join("\n");
    const r = splitMessage(long);
    for (const fact of ["6 people", "Marymoor Park", "October 12", "$500", "November 1", "prints"]) expect(r.text).toContain(fact);
  });

  it("a mostly automated message is left readable rather than emptied", () => {
    const auto = "Your order #4821 has shipped.\n\nTrack it: https://track.example.com/abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnop\n\nThis is an automated message, please do not reply.";
    const r = splitMessage(auto);
    expect(r.text).toContain("Your order #4821 has shipped");
    expect(r.text).toContain("[track.example.com link]");
    expect(r.text.length).toBeGreaterThan(10);
  });

  describe("isAcknowledgement", () => {
    it("recognises a closing thank-you that needs no reply", () => {
      for (const m of ["Thanks!", "Thank you so much!!", "Perfect, see you Saturday 👍", "Sounds good, looking forward to it.", "Got it, thanks again", "ok great"]) expect(isAcknowledgement(m), m).toBe(true);
    });
    it("never mistakes a question, a number or a request for one", () => {
      for (const m of ["Thanks! Can we do 3pm instead?", "Thank you. Is the $500 package still available", "Great — what should we wear?", "Thanks, could you send the address", "Perfect. October 14 works", "Thanks so much, one more thing: do you travel to Tacoma"]) expect(isAcknowledgement(m), m).toBe(false);
    });
  });
});
