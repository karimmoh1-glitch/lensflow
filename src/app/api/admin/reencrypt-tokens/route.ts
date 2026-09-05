import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifySeedSecret } from "@/lib/adminAuth";
import { encryptedWithCurrentKey, tokenCryptoConfigured } from "@/lib/tokenCrypto";

/**
 * Finishes a key rotation: every credential that still decrypts only under the previous
 * (or dev fallback) key is re-encrypted under INTEGRATION_TOKEN_ENCRYPTION_KEY. Reads go
 * through the Prisma extension (decrypt with any known key), writes re-encrypt with the
 * current one. Guarded by SEED_SECRET; reports counts only, never values.
 */
export async function POST(req: Request) {
  const auth = verifySeedSecret(req);
  if (auth === "rate-limited") return NextResponse.json({ error: "Too many attempts" }, { status: 429 });
  if (auth !== "ok") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!tokenCryptoConfigured()) return NextResponse.json({ error: "INTEGRATION_TOKEN_ENCRYPTION_KEY is not set." }, { status: 400 });

  const raw = await prisma.$queryRaw<Array<{ id: string; accessToken: string | null; refreshToken: string | null }>>`SELECT id, "accessToken", "refreshToken" FROM "Integration" WHERE "accessToken" IS NOT NULL OR "refreshToken" IS NOT NULL`;
  let rotated = 0;
  let unreadable = 0;
  for (const r of raw) {
    const stale = (r.accessToken && !encryptedWithCurrentKey(r.accessToken)) || (r.refreshToken && !encryptedWithCurrentKey(r.refreshToken));
    if (!stale) continue;
    const row = await prisma.integration.findUnique({ where: { id: r.id } }); // decrypted by the extension
    if (!row) continue;
    if ((r.accessToken && row.accessToken === null) || (r.refreshToken && row.refreshToken === null)) {
      unreadable++;
      continue;
    }
    await prisma.integration.update({ where: { id: r.id }, data: { accessToken: row.accessToken, refreshToken: row.refreshToken } });
    rotated++;
  }
  return NextResponse.json({ ok: true, rotated, unreadable, total: raw.length });
}
