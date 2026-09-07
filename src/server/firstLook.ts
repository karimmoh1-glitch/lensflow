import { prisma } from "@/lib/db";

/** The first minute in the inbox: what Daythread found and sorted, until the owner has replied to something. */
export async function getFirstLook(businessId: string) {
  const rows = await prisma.conversation.groupBy({ by: ["category"], where: { businessId, archived: false }, _count: { _all: true } });
  const by = Object.fromEntries(rows.map((r) => [r.category, r._count._all])) as Partial<Record<string, number>>;
  const total = rows.reduce((s, r) => s + r._count._all, 0);
  const needsYou = await prisma.lead.count({ where: { businessId, respondedAt: null, status: { in: ["NEW", "CONTACTED", "QUALIFIED"] } } });
  const outbound = await prisma.message.count({ where: { direction: "OUTBOUND", sentByUserId: { not: null }, conversation: { businessId } } });
  return { total, priority: by.PRIORITY ?? 0, automated: by.AUTOMATED ?? 0, promotional: by.PROMOTIONAL ?? 0, vendor: by.VENDOR ?? 0, internal: by.INTERNAL ?? 0, spam: by.SPAM ?? 0, needsYou, hasReplied: outbound > 0 };
}
