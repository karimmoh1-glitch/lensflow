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
  const text = await req.text();
  if (Buffer.byteLength(text, "utf8") > maxBytes) throw new PayloadTooLarge(maxBytes);
  return text;
}
