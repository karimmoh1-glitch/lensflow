import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireMobileBusiness, isErrorResponse } from "@/lib/mobileApi";

/** Real integration status, straight from the Integration table — DEMO is reported as
 * DEMO, never upgraded to look like CONNECTED. */
export async function GET(req: Request) {
  const ctx = await requireMobileBusiness(req);
  if (isErrorResponse(ctx)) return ctx;

  const integrations = await prisma.integration.findMany({
    where: { businessId: ctx.business.id },
    select: { provider: true, status: true, externalAccount: true, lastSyncedAt: true },
  });

  return NextResponse.json({ integrations });
}
