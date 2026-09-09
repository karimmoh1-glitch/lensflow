/**
 * Message cleaning: the latest meaningful content first, everything else kept.
 *
 * A real email carries its history with it — quoted replies, forwarded chains, mail-client
 * headers, signatures, disclaimers, tracking links. A reader wants the new sentence, not
 * the chain. `splitMessage` separates a raw body into what the person actually wrote now
 * (`text`), the quoted history (`quoted`), and a stripped signature (`signature`), without
 * ever losing anything: the raw body stays in the database, and the UI offers "Show
 * original". Pure and deterministic so it can run at render time and in tests.
 */
export type SplitMessage = {
  /** The new content, cleaned. Never empty for a non-empty input. */
  text: string;
  /** Quoted / forwarded history that was removed, if any. */
  quoted: string | null;
  /** A trailing signature that was removed, if any. */
  signature: string | null;
  /** True when anything at all was removed. */
  changed: boolean;
};

// Where quoted history begins. Each pattern anchors at a line start.
//
// The attribution line wraps: Gmail breaks "On <date> <name> <address>" before "wrote:"
// whenever the address makes the line long, which is most of the time. So the date/name
// span is matched across newlines ([\s\S]) and given room for a long display name and
// address, rather than assuming one short line. Anything longer than that is not an
// attribution line, and the bound keeps the pattern from swallowing a real paragraph.
const QUOTE_BOUNDARIES: RegExp[] = [
  /^On\s[\s\S]{5,300}?\bwrote:\s*$/im, // Gmail / Apple Mail, on one line or wrapped
  /^On\s[\s\S]{5,300}?\bwrote:\s*\n?>/im,
  /^-{2,}\s*Original Message\s*-{2,}\s*$/im, // Outlook
  /^-{2,}\s*Forwarded message\s*-{2,}\s*$/im, // Gmail forward
  /^Begin forwarded message:\s*$/im, // Apple Mail forward
  /^From:\s.+\n(?:Sent|Date):\s.+\n(?:To|Cc):\s.+/im, // Outlook header block
  /^Le\s[\s\S]{5,300}?\ba écrit\s*:\s*$/im, // French clients
  /^Am\s[\s\S]{5,300}?\bschrieb[\s\S]{0,80}?:\s*$/im, // German clients
  /^El\s[\s\S]{5,300}?\bescribió:\s*$/im, // Spanish clients
  /^_{10,}\s*$/m, // Outlook divider
];

// A signature starts here. "-- " is the RFC 3676 delimiter; the rest are what people type.
const SIGNATURE_STARTS: RegExp[] = [
  /^--\s?$/m,
  /^(?:best|best regards|kind regards|warm regards|warmly|regards|thanks|thank you|thanks again|cheers|sincerely|talk soon|all the best|take care|much love|xo+)[,!.]?\s*$/im,
];

// Lines that are never content.
const NOISE_LINE = /^(sent from my (iphone|ipad|android|samsung|galaxy|pixel)|get outlook for (ios|android)|sent via .{0,40}|sent from (mail|outlook|yahoo mail) for .{0,30})\.?$/i;

// Legal boilerplate paragraphs.
const DISCLAIMER = /^(this (e-?mail|message)( and any attachments)? (is|are|may be) (confidential|intended)|confidentiality notice|disclaimer:|the information (contained|transmitted) in this)/i;

// A paragraph that is only mailing-list footer links: nothing a person wrote.
const FOOTER_LINK = "(unsubscribe|manage (your )?(email )?preferences|update (your )?preferences|email preferences|view (this (e-?mail|message) )?(online|in (your )?browser)|opt[- ]out|privacy policy|terms( of (use|service))?|why (did i|am i) (get|receiving) this)";
const FOOTER_PARAGRAPH = new RegExp(`^${FOOTER_LINK}(\\s*[|·•\\-–—]\\s*${FOOTER_LINK})*[.\\s]*$`, "i");

export function splitMessage(raw: string): SplitMessage {
  if (!raw || !raw.trim()) return { text: raw ?? "", quoted: null, signature: null, changed: false };
  let text = raw.replace(/\r\n/g, "\n").replace(/ /g, " ");
  let quoted: string | null = null;
  let signature: string | null = null;

  // 1. Quoted history: cut at the earliest boundary.
  let cut = -1;
  for (const re of QUOTE_BOUNDARIES) {
    const m = re.exec(text);
    if (m && m.index >= 0 && (cut === -1 || m.index < cut)) cut = m.index;
  }
  // Quoted lines with no attribution header still count as quoting — one is enough, since
  // a line that begins with ">" is never something a person typed as their own message.
  const gtRun = /(?:^|\n)>.*/.exec(text);
  if (gtRun && (cut === -1 || gtRun.index < cut)) cut = gtRun.index;
  if (cut > 0) {
    quoted = text.slice(cut).trim() || null;
    text = text.slice(0, cut);
  } else if (cut === 0) {
    // The whole thing is a quote (a bare forward). Keep it visible rather than blank.
    quoted = null;
  }

  // 2. Drop stray quoted lines and mail-client noise.
  const kept: string[] = [];
  const paragraphsDropped: string[] = [];
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (t.startsWith(">")) { paragraphsDropped.push(t); continue; }
    if (NOISE_LINE.test(t)) { paragraphsDropped.push(t); continue; }
    kept.push(line);
  }
  text = kept.join("\n");

  // 3. Signature: from a known start line to the end, only when what follows is short
  //    (a name and a few contact lines), so a sign-off in the middle of a real message
  //    doesn't eat the rest of it.
  for (const re of SIGNATURE_STARTS) {
    const m = re.exec(text);
    if (!m) continue;
    const tail = text.slice(m.index);
    const tailLines = tail.split("\n").filter((l) => l.trim()).length;
    const before = text.slice(0, m.index).trim();
    if (tailLines <= 8 && before.length > 0) {
      signature = tail.trim() || null;
      text = text.slice(0, m.index);
      break;
    }
  }

  // 4. Disclaimers and tracking links.
  text = text
    .split(/\n{2,}/)
    .filter((p) => !DISCLAIMER.test(p.trim()) && !FOOTER_PARAGRAPH.test(p.trim().replace(/\s+/g, " ")))
    .join("\n\n")
    .replace(/https?:\/\/\S{40,}/g, (url) => {
      const domain = url.match(/^https?:\/\/(?:www\.)?([^/?#]+)/)?.[1];
      return domain ? `[${domain} link]` : "[link]";
    });

  // 5. Whitespace.
  text = text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

  if (!text) {
    // Never hand back nothing: fall back to the original, minus nothing.
    return { text: raw.trim(), quoted: null, signature: null, changed: false };
  }
  const changed = text !== raw.trim();
  return { text, quoted, signature, changed: changed || paragraphsDropped.length > 0 };
}

/** The one-line preview an inbox row shows: the new content, single-spaced, capped. */
/**
 * A closing acknowledgement — "Thanks!", "Perfect, see you Saturday", "Sounds good 👍" — is
 * not a question waiting for an answer. Only short messages made entirely of such words
 * count; anything with a question mark, a number, a price or a date request does not.
 */
const ACK_WORDS = new Set("ok okay k thanks thank thankyou thx ty you so much very perfect great awesome amazing wonderful lovely brilliant fantastic excellent sounds good got it will do noted appreciate appreciated that works for me yes yep yup sure thing looking forward to see then there talk soon bye cheers all best have a nice day weekend night morning evening take care many again really super cool fine alright received confirmed confirm confirming glad happy no problem worries can't wait cant wait excited we'll well be will me us our i am i'm the this is and of on at in".split(/\s+/));
const DAYS = /^(mon|tues?|wed(nes)?|thu(rs)?|fri|sat(ur)?|sun)(day)?$|^(today|tomorrow|tonight|weekend)$/;
export function isAcknowledgement(text: string): boolean {
  const t = text.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, " ").trim();
  if (!t || t.length > 160 || /[?$\d]/.test(t)) return false;
  const words = t.toLowerCase().replace(/[^a-z'\s]/g, " ").split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > 25) return false;
  return words.every((w) => ACK_WORDS.has(w) || DAYS.test(w));
}

export function previewOf(raw: string, max = 160): string {
  const { text } = splitMessage(raw);
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > max ? oneLine.slice(0, max - 1).trimEnd() + "…" : oneLine;
}
