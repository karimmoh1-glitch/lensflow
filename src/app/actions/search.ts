"use server";

import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";

/**
 * One search across the whole thread — people, conversations, bookings, payments —
 * scoped to the caller's business. Returns a small, ranked set for the command palette:
 * exact-ish name matches first, then everything else by recency.
 */
export type SearchHit =
  | { kind: "client"; id: string; title: string; subtitle: string; href: string }
  | { kind: "conversation"; id: string; title: string; subtitle: string; href: string }
  | { kind: "booking"; id: string; title: string; subtitle: string; href: string }
  | { kind: "payment"; id: string; title: string; subtitle: string; href: string }
  | { kind: "automation"; id: string; title: string; subtitle: string; href: string };

export async function universalSearch(q: string): Promise<{ hits: SearchHit[]; summary?: { name: string; conversations: number; bookings: number; paidCents: number; nextAction: string | null; href: string } }> {
  const ctx = await requireRole(["OWNER", "ADMIN", "PHOTOGRAPHER"]);
  if (!ctx) return { hits: [] };
  const term = q.trim();
  if (term.length < 2) return { hits: [] };
  const businessId = ctx.business.id;
  const contains = { contains: term, mode: "insensitive" as const };

  const [clients, conversations, bookings, payments, automations] = await Promise.all([
    prisma.client.findMany({
      where: { businessId, OR: [{ name: contains }, { email: contains }, { phone: contains }, { instagram: contains }] },
      include: { _count: { select: { conversations: true, bookings: true } }, payments: { where: { status: "PAID" }, select: { amountCents: true } }, leads: { where: { respondedAt: null, status: { notIn: ["BOOKED", "LOST"] } }, select: { id: true, conversationId: true }, take: 1 }, bookings: { where: { startAt: { gte: new Date() }, status: { not: "CANCELED" } }, orderBy: { startAt: "asc" }, take: 1, include: { service: { select: { name: true } } } } },
      take: 5,
      orderBy: { updatedAt: "desc" },
    }),
    prisma.conversation.findMany({
      where: { businessId, archived: false, OR: [{ subject: contains }, { externalHandle: contains }, { client: { name: contains } }, { messages: { some: { body: contains } } }] },
      include: { client: { select: { name: true } }, messages: { orderBy: { createdAt: "desc" }, take: 1, select: { body: true } } },
      take: 5,
      orderBy: { lastMessageAt: "desc" },
    }),
    prisma.booking.findMany({
      where: { businessId, OR: [{ client: { name: contains } }, { service: { name: contains } }] },
      include: { client: { select: { name: true } }, service: { select: { name: true } } },
      take: 4,
      orderBy: { startAt: "desc" },
    }),
    prisma.payment.findMany({
      where: { businessId, OR: [{ client: { name: contains } }, { reference: contains }] },
      include: { client: { select: { name: true } } },
      take: 4,
      orderBy: { createdAt: "desc" },
    }),
    prisma.automation.findMany({ where: { businessId, OR: [{ name: contains }, { messageTemplate: contains }] }, take: 3 }),
  ]);

  const money = (c: number) => `$${(c / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  const hits: SearchHit[] = [
    ...clients.map((c) => ({
      kind: "client" as const,
      id: c.id,
      title: c.name,
      subtitle: `${c.relationship === "CUSTOMER" ? "Customer" : c.relationship === "CONTACT" ? "Contact" : "Potential client"} · ${c._count.conversations} conversation${c._count.conversations === 1 ? "" : "s"} · ${c._count.bookings} booking${c._count.bookings === 1 ? "" : "s"}`,
      href: `/dashboard/clients/${c.id}`,
    })),
    ...conversations.map((c) => ({
      kind: "conversation" as const,
      id: c.id,
      title: c.client?.name ?? c.externalHandle ?? "Conversation",
      subtitle: (c.subject ? `${c.subject} · ` : "") + (c.messages[0]?.body?.slice(0, 70) ?? ""),
      href: `/dashboard/inbox?c=${c.id}`,
    })),
    ...bookings.map((b) => ({
      kind: "booking" as const,
      id: b.id,
      title: `${b.client.name} · ${b.service.name}`,
      subtitle: `${b.startAt.toLocaleDateString(undefined, { month: "short", day: "numeric" })} · ${b.status.replaceAll("_", " ").toLowerCase()} · ${money(b.totalCents)}`,
      href: `/dashboard/bookings/${b.id}`,
    })),
    ...payments.map((p) => ({
      kind: "payment" as const,
      id: p.id,
      title: `${p.client?.name ?? "Payment"} · ${money(p.amountCents)}`,
      subtitle: `${p.purpose.toLowerCase()} · ${p.status.replaceAll("_", " ").toLowerCase()}`,
      href: "/dashboard/payments",
    })),
    ...automations.map((a) => ({
      kind: "automation" as const,
      id: a.id,
      title: a.name,
      subtitle: `${a.enabled ? "Running" : "Paused"} · ${a.trigger.replaceAll("_", " ").toLowerCase()}`,
      href: "/dashboard/automations",
    })),
  ];

  const top = clients[0];
  const summary = top
    ? {
        name: top.name,
        conversations: top._count.conversations,
        bookings: top._count.bookings,
        paidCents: top.payments.reduce((s, p) => s + p.amountCents, 0),
        nextAction: top.leads[0] ? "Reply — they're waiting" : top.bookings[0] ? `${top.bookings[0].service.name} · ${top.bookings[0].startAt.toLocaleDateString(undefined, { month: "short", day: "numeric" })}` : top._count.bookings === 0 ? "Follow up" : null,
        href: top.leads[0]?.conversationId ? `/dashboard/inbox?c=${top.leads[0].conversationId}` : `/dashboard/clients/${top.id}`,
      }
    : undefined;

  return { hits, summary };
}
