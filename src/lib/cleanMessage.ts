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
const QUOTE_BOUNDARIES: RegExp[] = [
  /^On .{5,120}?wrote:\s*$/im, // Gmail / Apple Mail: "On Sun, Aug 30, 2026 at 4:35 PM Name <a@b> wrote:"
  /^On .{5,120}?wrote:\s*\n?>/im,
  /^-{2,}\s*Original Message\s*-{2,}\s*$/im, // Outlook
  /^-{2,}\s*Forwarded message\s*-{2,}\s*$/im, // Gmail forward
  /^Begin forwarded message:\s*$/im, // Apple Mail forward
  /^From:\s.+\n(?:Sent|Date):\s.+\n(?:To|Cc):\s.+/im, // Outlook header block
  /^Le .{5,120}? a écrit\s*:\s*$/im, // French clients
  /^Am .{5,120}? schrieb .{0,60}:\s*$/im, // German clients
  /^El .{5,120}? escribió:\s*$/im, // Spanish clients
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
  // A run of ">" lines with no header still counts as quoting.
  const gtRun = /(?:^|\n)(?:>.*\n?){2,}/.exec(text);
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
    .filter((p) => !DISCLAIMER.test(p.trim()))
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
export function previewOf(raw: string, max = 160): string {
  const { text } = splitMessage(raw);
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > max ? oneLine.slice(0, max - 1).trimEnd() + "…" : oneLine;
}
