import { NextResponse } from "next/server";
import { jsonError } from "@/lib/mobileApi";
import { z } from "zod";
import { forgotPassword } from "@/app/actions/auth";
const schema = z.object({ email: z.string().trim().email() });
/** Same non-enumerating reset as the web: always "sent" for a well-formed address, rate-limited per IP. */
export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("Enter a valid email.", 400);
  const fd = new FormData(); fd.set("email", parsed.data.email);
  const r = await forgotPassword(fd);
  return r.error ? jsonError(r.error, 429) : NextResponse.json({ ok: true });
}
