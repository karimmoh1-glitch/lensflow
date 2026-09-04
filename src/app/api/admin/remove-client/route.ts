import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifySeedSecret } from "@/lib/adminAuth";

/** Read-only lookup: find which business/client a piece of junk landed under, by a
 * substring match on the message body or client name/email — so a specific record can
 * be targeted for removal without guessing. Same auth as the delete below. */
export async function GET(req: Request) {
  const auth = verifySeedSecret(req);
  if (auth === "unconfigured") return NextResponse.json({ error: "SEED_SECRET is not configured on this deployment." }, { status: 501 });
  if (auth === "rate-limited") return NextResponse.json({ error: "Too many attempts" }, { status: 429 });
  if (auth !== "ok") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const q = url.searchParams.get("q");
  const businessHandle = url.searchParams.get("business");
  if (!q || !businessHandle) return NextResponse.json({ error: "Pass ?q=<search text>&business=<handle>" }, { status: 400 });

  // Scoped to one business: an infrastructure tool must never read across tenants.
  const messages = await prisma.message.findMany({
    where: { body: { contains: q, mode: "insensitive" }, conversation: { business: { handle: businessHandle } } },
    include: { conversation: { include: { client: true, business: true } } },
    take: 10,
  });

  return NextResponse.json({
    matches: messages.map((m) => ({
      messageId: m.id,
      businessName: m.conversation.business.name,
      businessHandle: m.conversation.business.handle,
      clientName: m.conversation.client?.name,
      clientEmail: m.conversation.client?.email,
      snippet: m.body.slice(0, 120),
    })),
  });
}

/**
 * One-off cleanup tool: deletes a client (and their conversations/messages/leads/
 * bookings/payments) by exact email, for wiping out junk that slipped into a
 * business's inbox before a filtering fix landed — e.g. a newsletter ingested as a
 * "lead" from an early version of the Gmail sync. Guarded by SEED_SECRET, same as the
 * seed endpoint — infrastructure-only, never a public feature.
 */
export async function POST(req: Request) {
  const auth = verifySeedSecret(req);
  if (auth === "unconfigured") {
    return NextResponse.json({ error: "SEED_SECRET is not configured on this deployment." }, { status: 501 });
  }
  if (auth === "rate-limited") {
    return NextResponse.json({ error: "Too many attempts" }, { status: 429 });
  }
  if (auth !== "ok") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { email, business } = await req.json().catch(() => ({ email: undefined, business: undefined }));
  if (!email || typeof email !== "string" || !business || typeof business !== "string") {
    return NextResponse.json({ error: "Body must include { email: string, business: <handle> }" }, { status: 400 });
  }

  try {
    // Scoped to one business by handle: never delete across tenants.
    const clients = await prisma.client.findMany({ where: { email, business: { handle: business } } });
    if (clients.length === 0) return NextResponse.json({ ok: true, removed: 0 });

    for (const c of clients) {
      await prisma.lead.deleteMany({ where: { clientId: c.id } });
      await prisma.message.deleteMany({ where: { conversation: { clientId: c.id } } });
      await prisma.conversation.deleteMany({ where: { clientId: c.id } });
      await prisma.payment.deleteMany({ where: { clientId: c.id } });
      await prisma.booking.deleteMany({ where: { clientId: c.id } });
      await prisma.client.delete({ where: { id: c.id } });
    }

    return NextResponse.json({ ok: true, removed: clients.length });
  } catch (err) {
    console.error("[admin/remove-client] failed:", err);
    return NextResponse.json({ error: "Cleanup failed" }, { status: 500 });
  }
}
