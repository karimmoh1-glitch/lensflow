import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { seedDemoWorkspace } from "@/server/seedDemo";

/**
 * One-off deployment bootstrap: (re)creates the demo workspace against whichever
 * database DATABASE_URL points at. Guarded by SEED_SECRET so it can't be triggered by
 * anyone who doesn't already have deploy-level access to this project's env vars — this
 * is infrastructure setup, not a public feature, and resets the demo org's data every
 * time it's called.
 */
export async function POST(req: Request) {
  const secret = process.env.SEED_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "SEED_SECRET is not configured on this deployment." }, { status: 501 });
  }

  const provided = req.headers.get("x-seed-secret");
  if (provided !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await seedDemoWorkspace(prisma);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[admin/seed] failed:", err);
    return NextResponse.json({ error: "Seeding failed", detail: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
