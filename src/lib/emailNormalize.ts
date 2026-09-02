import { cleanEmailBody } from "./emailText";

/**
 * Turns whatever a provider handed us (Gmail API's parsed MIME parts, Resend's
 * retrieve-email response) into the same clean, human-readable text a person would
 * see if they opened the email themselves — never the raw payload. This is the single
 * entry point both ingestion paths (Gmail sync, Resend webhook) funnel through, so
 * there is one place that defines "readable," not two competing ones.
 *
 * Order matters: prefer real plain text when it's actually present and non-trivial;
 * otherwise convert HTML to text. Either way, run the result through quoted-printable
 * decoding, a raw-MIME-artifact safety net, and the existing quote-chain/signature
 * cleanup — so no matter which path handed us slightly-off content, the same guarantees
 * apply to it.
 */
export function normalizeEmailContent(input: { text?: string | null; html?: string | null }): string {
  let candidate = input.text?.trim() || null;

  // A "text" part that's actually markup (some providers mislabel, or a template
  // leaks a stray tag) gets treated as HTML instead of displayed with visible tags.
  if (candidate && looksLikeHtml(candidate)) candidate = null;

  if (!candidate || candidate.length < 2) {
    candidate = input.html ? htmlToText(input.html) : null;
  }

  if (!candidate) return "(no content)";

  candidate = decodeQuotedPrintable(candidate);
  candidate = stripRawEmailArtifacts(candidate);
  candidate = cleanEmailBody(candidate);

  return candidate.trim() || "(no content)";
}

function looksLikeHtml(text: string): boolean {
  return /<\/?(html|body|div|p|span|table|tr|td|a|br|img)[\s>]/i.test(text);
}

// ── HTML → text ──────────────────────────────────────────────────────────────

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  copy: "©",
  reg: "®",
  trade: "™",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  bull: "•",
};

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => safeCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => safeCodePoint(parseInt(dec, 10)))
    .replace(/&([a-z]+);/gi, (m, name) => NAMED_ENTITIES[name.toLowerCase()] ?? m);
}

function safeCodePoint(code: number): string {
  try {
    return String.fromCodePoint(code);
  } catch {
    return "";
  }
}

/**
 * Strips an HTML email down to readable text: drops script/style/head content and
 * comments (including Outlook's MSO conditional blocks) entirely, removes tracking
 * pixels and hidden elements, turns links into their visible label (falling back to
 * the URL only if there's no label), converts block-level tags to line breaks, then
 * strips whatever markup remains and decodes entities.
 */
export function htmlToText(html: string): string {
  let text = html;

  text = text.replace(/<!--[\s\S]*?-->/g, "");
  text = text.replace(/<(script|style|head|title)[^>]*>[\s\S]*?<\/\1>/gi, "");

  // Tracking pixels: 1x1 (or 0x0) images.
  text = text.replace(/<img\b[^>]*\b(?:width|height)\s*=\s*["']?0?1["']?[^>]*>/gi, "");
  // Hidden elements via inline style.
  text = text.replace(/<[a-z]+\b[^>]*style\s*=\s*["'][^"']*(?:display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0)[^"']*["'][^>]*>[\s\S]*?<\/[a-z]+>/gi, "");

  // Links: keep the visible label (or the URL if there's no label text).
  text = text.replace(/<a\s+[^>]*href\s*=\s*["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi, (_m, href, inner) => {
    const label = inner.replace(/<[^>]+>/g, "").trim();
    return label && label !== href ? label : href;
  });

  // Images without a useful link context: use alt text if present, otherwise drop.
  text = text.replace(/<img\b[^>]*\balt\s*=\s*["']([^"']+)["'][^>]*>/gi, (_m, alt) => (alt.trim() ? ` ${alt.trim()} ` : ""));
  text = text.replace(/<img\b[^>]*>/gi, "");

  // Block-level elements become line breaks; list items get a bullet.
  text = text.replace(/<li[^>]*>/gi, "\n• ");
  text = text.replace(/<\/(p|div|tr|table|h[1-6]|blockquote)>/gi, "\n");
  text = text.replace(/<br\s*\/?>/gi, "\n");

  // Whatever markup remains gets dropped outright.
  text = text.replace(/<[^>]+>/g, "");

  text = decodeHtmlEntities(text);

  // Collapse whitespace without destroying paragraph structure.
  text = text.replace(/[ \t]+/g, " ");
  text = text.replace(/[ \t]*\n[ \t]*/g, "\n");
  text = text.replace(/\n{3,}/g, "\n\n");

  return text.trim();
}

// ── Quoted-printable ────────────────────────────────────────────────────────

/**
 * Decodes quoted-printable content (`=XX` hex escapes, `=` soft line breaks) back to
 * real text. Operates on raw bytes rather than character-by-character so multi-byte
 * UTF-8 sequences (e.g. `=E2=80=99` for a curly apostrophe) decode correctly instead
 * of turning into mojibake. Only runs when the text actually looks encoded, so normal
 * content that happens to contain an `=` is never touched.
 */
export function decodeQuotedPrintable(text: string): string {
  if (!/=[0-9A-F]{2}/i.test(text) && !/=\r?\n/.test(text)) return text;

  const withoutSoftBreaks = text.replace(/=\r?\n/g, "");
  const bytes: number[] = [];
  for (let i = 0; i < withoutSoftBreaks.length; i++) {
    const ch = withoutSoftBreaks[i];
    const next2 = withoutSoftBreaks.slice(i + 1, i + 3);
    if (ch === "=" && /^[0-9A-F]{2}$/i.test(next2)) {
      bytes.push(parseInt(next2, 16));
      i += 2;
    } else {
      bytes.push(ch.charCodeAt(0));
    }
  }

  try {
    return Buffer.from(bytes).toString("utf-8");
  } catch {
    return withoutSoftBreaks;
  }
}

// ── Raw MIME safety net ─────────────────────────────────────────────────────

/**
 * Belt-and-suspenders: Gmail's API and Resend's retrieve endpoint both hand back
 * already-parsed content, so this should rarely fire — but if anything ever leaks a
 * raw MIME boundary line or header block into the text we extracted, strip it rather
 * than show it. Never the primary parsing path, just a guardrail.
 */
export function stripRawEmailArtifacts(text: string): string {
  let out = text;
  // Boundary delimiter lines: "------=_Part_123_456.789" or "--boundary--".
  out = out.replace(/^--[-=_.a-zA-Z0-9]{8,}-{0,2}\s*$/gm, "");
  // Raw header lines that sometimes precede a body when a client splits things badly.
  out = out.replace(/^(Content-Type|Content-Transfer-Encoding|Content-Disposition|MIME-Version|X-[\w-]+):.*$/gim, "");
  return out;
}
