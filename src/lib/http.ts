/**
 * Reads a request body with a hard size ceiling. Webhook payloads from Stripe, Twilio,
 * Meta and Resend are kilobytes; anything larger is either a mistake or an attempt to make
 * the function do expensive work, and is refused before parsing.
 */
export class PayloadTooLarge extends Error {
  constructor(public limit: number) {
    super(`Payload exceeds ${limit} bytes`);
  }
}

export async function readBoundedText(req: Request, maxBytes = 256 * 1024): Promise<string> {
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > maxBytes) throw new PayloadTooLarge(maxBytes);
  if (!req.body) return "";
  // Counted as it arrives, so a chunked body with no length header is cut off at the
  // ceiling instead of being buffered whole first.
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new PayloadTooLarge(maxBytes);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf8");
}
