import Link from "next/link";
import { Card, CardBody } from "@/components/ui";
import { clientFiles } from "@/server/clientFiles";
import { CreateFolderButton } from "./CreateFolderButton";

/**
 * The person's folder in each connected file store: made on request, listed live. Files
 * stay where they are; Daythread shows names and links only.
 */
export async function ClientFilesCard({ businessId, clientId }: { businessId: string; clientId: string }) {
  const stores = await clientFiles(businessId, clientId);
  if (stores.length === 0) return null;
  return (
    <Card>
      <CardBody>
        <div className="text-xs font-semibold uppercase tracking-wide text-ink/65 mb-2">Files</div>
        <div className="space-y-3">
          {stores.map((s) => (
            <div key={s.provider}>
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-medium text-ink">{s.name}</div>
                {s.folder?.url ? <Link href={s.folder.url} target="_blank" rel="noreferrer" className="text-xs font-semibold text-ink/70 hover:text-ink">Open folder</Link> : <CreateFolderButton clientId={clientId} provider={s.provider} />}
              </div>
              {s.error && <p className="mt-1 text-[11px] text-warning-text">{s.error}</p>}
              {s.folder && !s.error && s.files.length === 0 && <p className="mt-1 text-[11px] text-ink/65">Folder is empty. Anything added there shows up here.</p>}
              {s.files.length > 0 && (
                <ul className="mt-1.5 space-y-1">
                  {s.files.slice(0, 8).map((f) => (
                    <li key={f.id} className="text-[12px] text-ink/80 truncate">
                      {f.url ? <Link href={f.url} target="_blank" rel="noreferrer" className="hover:underline">{f.name}</Link> : f.name}
                      {f.isFolder ? <span className="text-ink/50"> · folder</span> : null}
                    </li>
                  ))}
                  {s.files.length > 8 && <li className="text-[11px] text-ink/55">and {s.files.length - 8} more in the folder</li>}
                </ul>
              )}
            </div>
          ))}
        </div>
      </CardBody>
    </Card>
  );
}
