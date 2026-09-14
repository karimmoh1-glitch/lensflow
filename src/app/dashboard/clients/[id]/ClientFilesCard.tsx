import Link from "next/link";
import { formatDistanceToNowStrict } from "date-fns";
import { Card, CardBody } from "@/components/ui";
import { clientFiles, type FolderRef } from "@/server/clientFiles";
import { prisma } from "@/lib/db";
import { ClientFilesActions } from "./ClientFilesActions";

/**
 * This person's folder in each connected file store: made on request, shared with them by
 * name, and sent when the work is ready. The files never move — Daythread keeps the link
 * between a person and their folder, and remembers what was sent.
 */
export async function ClientFilesCard({ businessId, clientId }: { businessId: string; clientId: string }) {
  const [stores, client] = await Promise.all([
    clientFiles(businessId, clientId),
    prisma.client.findFirst({ where: { id: clientId, businessId }, select: { email: true, phone: true } }),
  ]);
  if (stores.length === 0) return null;
  const clientHasContact = Boolean(client?.email || client?.phone);

  return (
    <Card>
      <CardBody>
        <div className="text-xs font-semibold uppercase tracking-wide text-ink/65 mb-2">Files</div>
        <div className="space-y-4">
          {stores.map((s) => {
            const folder = (s.folder ?? null) as FolderRef | null;
            return (
              <div key={s.provider}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-ink">{s.name}</div>
                    {folder?.deliveredAt ? (
                      <p className="text-[11px] text-success-text">Sent {formatDistanceToNowStrict(new Date(folder.deliveredAt))} ago{folder.deliveredVia ? ` by ${folder.deliveredVia.toLowerCase()}` : ""}</p>
                    ) : folder?.sharedWith ? (
                      <p className="text-[11px] text-ink/65">Shared with {folder.sharedWith}</p>
                    ) : folder ? (
                      <p className="text-[11px] text-ink/65">Not shared with the client yet</p>
                    ) : (
                      <p className="text-[11px] text-ink/65">No folder yet</p>
                    )}
                  </div>
                  <ClientFilesActions
                    clientId={clientId}
                    model={{
                      provider: s.provider,
                      name: s.name,
                      hasFolder: Boolean(folder),
                      url: folder?.url ?? null,
                      sharedWith: folder?.sharedWith ?? null,
                      deliveredAt: folder?.deliveredAt ?? null,
                      clientHasContact,
                    }}
                  />
                </div>
                {s.error && <p className="mt-1 text-[11px] text-warning-text">{s.error}</p>}
                {folder && !s.error && s.files.length === 0 && <p className="mt-1 text-[11px] text-ink/65">Folder is empty. Anything you add there shows up here.</p>}
                {s.files.length > 0 && (
                  <ul className="mt-1.5 space-y-1">
                    {s.files.slice(0, 8).map((f) => (
                      <li key={f.id} className="text-[12px] text-ink/80 truncate">
                        {f.url ? (
                          <Link href={f.url} target="_blank" rel="noreferrer" className="hover:underline">
                            {f.name}
                          </Link>
                        ) : (
                          f.name
                        )}
                        {f.isFolder ? <span className="text-ink/50"> · folder</span> : null}
                      </li>
                    ))}
                    {s.files.length > 8 && <li className="text-[11px] text-ink/55">and {s.files.length - 8} more in the folder</li>}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </CardBody>
    </Card>
  );
}
