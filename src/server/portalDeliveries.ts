import { prisma } from "@/lib/db";
import type { ExternalFolders, FileProvider } from "@/server/clientFiles";

/**
 * What a client has actually been sent.
 *
 * Until now a delivery existed in three places and appeared in none of them for the person
 * it was for: the folder link sat on the client record, the booking carried its own copy,
 * and the message went out by email — which this deployment cannot send. A customer whose
 * photographer had delivered their gallery had no way to reach it.
 *
 * Only a delivery the business actually made shows here. Creating a folder is not sending
 * it, and sharing it is not sending it either; the timestamp written when the link went out
 * is the condition, so the portal never offers a customer something nobody meant to give
 * them.
 */
export type PortalDelivery = {
  id: string;
  /** What it was for, in the customer's language: the service they booked, or their files. */
  title: string;
  url: string;
  deliveredAt: Date;
  /** "Google Drive" or "Dropbox" — so a customer knows what they are about to open. */
  source: string | null;
  note: string | null;
};

const PROVIDER_NAME: Record<FileProvider, string> = { GOOGLE_DRIVE: "Google Drive", DROPBOX: "Dropbox" };

export async function portalDeliveries(businessId: string, clientId: string): Promise<PortalDelivery[]> {
  const [client, bookings] = await Promise.all([
    prisma.client.findFirst({ where: { id: clientId, businessId }, select: { externalFolders: true } }),
    prisma.booking.findMany({
      where: { clientId, businessId, deliveredAt: { not: null }, deliveryUrl: { not: null } },
      select: { id: true, deliveryUrl: true, deliveredAt: true, deliveryNote: true, service: { select: { name: true } } },
      orderBy: { deliveredAt: "desc" },
      take: 50,
    }),
  ]);

  const out: PortalDelivery[] = bookings.map((b) => ({
    id: b.id,
    title: b.service.name,
    url: b.deliveryUrl!,
    deliveredAt: b.deliveredAt!,
    source: null,
    note: b.deliveryNote,
  }));

  // A delivery made without naming a booking lives on the client record instead. Skip the
  // ones already listed above, matched by their link, so the same folder is offered once.
  const seen = new Set(out.map((d) => d.url));
  const folders = (client?.externalFolders ?? {}) as ExternalFolders;
  for (const provider of ["GOOGLE_DRIVE", "DROPBOX"] as FileProvider[]) {
    const folder = folders[provider];
    if (!folder?.deliveredAt || !folder.url || seen.has(folder.url)) continue;
    out.push({
      id: `${provider}-folder`,
      title: "Your files",
      url: folder.url,
      deliveredAt: new Date(folder.deliveredAt),
      source: PROVIDER_NAME[provider],
      note: null,
    });
  }

  return out.sort((a, b) => b.deliveredAt.getTime() - a.deliveredAt.getTime());
}
