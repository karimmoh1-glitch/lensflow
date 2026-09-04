import { prisma } from "@/lib/db";
import { subDays } from "date-fns";

/**
 * What Daythread did for you in the last 7 days — counted from real records only.
 * The time figure is an estimate and is labeled as one wherever it's shown:
 * it assumes ~1 minute per automated message not written by hand, ~2 minutes per
 * automated/promotional email kept out of the priority inbox, and ~5 minutes per
 * inbound inquiry that Daythread structured (name, service, date) instead of you.
 */
export async function getWeekStrip(businessId: string) {
  const since = subDays(new Date(), 7);
  const [automatedSent, keptOut, structuredLeads, bookedLeads, customers, leads, contacts, automationsOn, waitingNow] = await Promise.all([
    prisma.automationExecution.count({ where: { businessId, ranAt: { gte: since }, result: "sent" } }),
    prisma.conversation.count({ where: { businessId, createdAt: { gte: since }, category: { not: "PRIORITY" } } }),
    prisma.lead.count({ where: { businessId, createdAt: { gte: since } } }),
    prisma.lead.count({ where: { businessId, status: "BOOKED", updatedAt: { gte: since } } }),
    prisma.client.count({ where: { businessId, relationship: "CUSTOMER" } }),
    prisma.client.count({ where: { businessId, relationship: "LEAD" } }),
    prisma.client.count({ where: { businessId, relationship: "CONTACT" } }),
    prisma.automation.count({ where: { businessId, enabled: true } }),
    prisma.lead.count({ where: { businessId, respondedAt: null, status: { notIn: ["BOOKED", "LOST"] } } }),
  ]);
  const estimatedMinutes = automatedSent * 1 + keptOut * 2 + structuredLeads * 5;
  return { automatedSent, keptOut, structuredLeads, bookedLeads, estimatedMinutes, relationships: { customers, leads, contacts }, automationsOn, waitingNow };
}
export type WeekStrip = Awaited<ReturnType<typeof getWeekStrip>>;
