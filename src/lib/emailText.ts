/**
 * Strips the noise a real email brings that a rule-based extractor (and a human
 * skimming the inbox) doesn't need: quoted reply chains, client-injected signatures,
 * and the blank-line padding mail clients add. Never touches the actual message
 * content — only removes what's clearly quoted/boilerplate, and falls back to the
 * original text untouched if nothing recognizable is found (never returns empty for
 * a non-empty input).
 */
export function cleanEmailBody(raw: string): string {
  if (!raw) return raw;

  let text = raw.replace(/\r\n/g, "\n");

  // Cut everything from the first "On <date>, <name> wrote:" line onward — this is
  // where the quoted thread history starts in virtually every mail client.
  const quoteHeaderPattern = /\n?On .{5,80}wrote:\s*\n/i;
  const quoteMatch = text.match(quoteHeaderPattern);
  if (quoteMatch && quoteMatch.index !== undefined) {
    text = text.slice(0, quoteMatch.index);
  }

  // Gmail/Outlook also sometimes mark the boundary with a lone "From:" block instead.
  const fromHeaderPattern = /\n(From:\s.+\nSent:\s.+\nTo:\s.+\nSubject:\s.+)/i;
  const fromMatch = text.match(fromHeaderPattern);
  if (fromMatch && fromMatch.index !== undefined) {
    text = text.slice(0, fromMatch.index);
  }

  // Drop quoted lines (">") that survived the above, plus common client-added footers.
  const lines = text.split("\n").filter((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith(">")) return false;
    if (/^sent from my (iphone|ipad|android|samsung)/i.test(trimmed)) return false;
    if (/^get outlook for (ios|android)/i.test(trimmed)) return false;
    return true;
  });
  text = lines.join("\n");

  // Collapse 3+ blank lines down to one, trim edges.
  text = text.replace(/\n{3,}/g, "\n\n").trim();

  return text || raw.trim();
}
