"use server";

import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { previewOf } from "@/lib/cleanMessage";

/**
 * One search across the inbox — people and conversations, including message text —
 * scoped to the caller's workspace. Returns a small, ranked set for the command palette:
 * people first, then conversations by recency.
 */
export type SearchHit =
  | { kind: "person"; id: string; title: string; subtitle: string; href: string }
  | { kind: "conversation"; id: string; title: string; subtitle: string; href: string };

export async function universalSearch(q: string): Promise<{ hits: SearchHit[] }> {
  const ctx = await requireRole(["OWNER", "ADMIN", "PHOTOGRAPHER"]);
  if (!ctx) return { hits: [] };
  const term = q.trim().slice(0, 120);
  if (term.length < 2) return { hits: [] };
  const businessId = ctx.business.id;
  const contains = { contains: term, mode: "insensitive" as const };

  const [people, conversations] = await Promise.all([
    prisma.client.findMany({
      where: { businessId, OR: [{ name: contains }, { email: contains }, { phone: contains }, { instagram: contains }] },
      include: { conversations: { where: { archived: false }, orderBy: { lastMessageAt: "desc" }, take: 1, select: { id: true, channel: true, lastMessageAt: true } }, _count: { select: { conversations: true } } },
      take: 5,
      orderBy: { updatedAt: "desc" },
    }),
    prisma.conversation.findMany({
      where: { businessId, archived: false, OR: [{ subject: contains }, { externalHandle: contains }, { client: { name: contains } }, { messages: { some: { body: contains } } }] },
      include: { client: { select: { name: true } }, messages: { orderBy: { createdAt: "desc" }, take: 1, select: { body: true } } },
      take: 8,
      orderBy: { lastMessageAt: "desc" },
    }),
  ]);

  const hits: SearchHit[] = [
    ...people.map((c) => ({
      kind: "person" as const,
      id: c.id,
      title: c.name,
      subtitle: [c.email, c.phone, c.instagram ? `@${c.instagram.replace(/^@/, "")}` : null].filter(Boolean).join(" · ") || `${c._count.conversations} conversation${c._count.conversations === 1 ? "" : "s"}`,
      href: c.conversations[0] ? `/dashboard/inbox?c=${c.conversations[0].id}` : `/dashboard/inbox?q=${encodeURIComponent(c.name)}`,
    })),
    ...conversations.map((c) => ({
      kind: "conversation" as const,
      id: c.id,
      title: c.client?.name ?? c.externalHandle ?? "Conversation",
      subtitle: (c.subject ? `${c.subject} · ` : "") + previewOf(c.messages[0]?.body ?? "").slice(0, 80),
      href: `/dashboard/inbox?c=${c.id}`,
    })),
  ];

  return { hits };
}
