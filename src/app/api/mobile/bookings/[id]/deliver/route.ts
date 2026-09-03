import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireMobileRole, isErrorResponse, jsonError } from "@/lib/mobileApi";

const deliverSchema = z.object({
  url: z.string().url("Enter a valid gallery URL"),
  note: z.string().optional(),
});

/**
 * Marks a completed booking as delivered with a real gallery link (Pixieset, Google Drive,
 * Dropbox — however this business actually hands off photos). There's no file storage of
 * our own here; this persists a real URL + timestamp against the booking, same as any
 * other field on it — not a simulated state.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireMobileRole(req, ["OWNER", "ADMIN", "PHOTOGRAPHER"]);
  if (isErrorResponse(ctx)) return ctx;
  const { id } = await params;

  const body = await req.json().catch(() => null);
  const parsed = deliverSchema.safeParse(body);
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "Invalid input", 400);

  const booking = await prisma.booking.findFirst({ where: { id, businessId: ctx.business.id } });
  if (!booking) return jsonError("Not found", 404);

  const updated = await prisma.booking.update({
    where: { id: booking.id },
    data: {
      deliveryUrl: parsed.data.url,
      deliveryNote: parsed.data.note || null,
      deliveredAt: new Date(),
      status: booking.status === "CANCELED" ? booking.status : "COMPLETED",
      completedAt: booking.completedAt ?? new Date(),
    },
  });

  return NextResponse.json({
    deliveryUrl: updated.deliveryUrl,
    deliveryNote: updated.deliveryNote,
    deliveredAt: updated.deliveredAt,
    status: updated.status,
  });
}
