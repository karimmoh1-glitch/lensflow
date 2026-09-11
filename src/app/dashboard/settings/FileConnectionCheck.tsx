"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { checkFileConnection } from "@/app/actions/connect";
import type { FileProviderCheck } from "@/server/fileProviderCheck";

/**
 * Asks the provider, live, whether this file connection still works. A stored "connected"
 * cannot know that the folder was deleted, a permission was withdrawn, or the account was
 * reconnected as somebody else — and a business finds all three out at the worst moment,
 * when they are trying to send a client their files.
 */
export function FileConnectionCheck({ provider, initial }: { provider: "GOOGLE_DRIVE" | "DROPBOX"; initial: FileProviderCheck | null }) {
  const [check, setCheck] = useState<FileProviderCheck | null>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const run = () =>
    start(async () => {
      setError(null);
      const r = await checkFileConnection(provider);
      if (!r.ok) return setError(r.error);
      setCheck(r.check);
    });

  return (
    <div className="rounded-xl border border-border bg-paper/60 px-3 py-2.5 text-xs">
      <div className="flex items-center justify-between gap-3">
        <p className="font-semibold text-ink/75">Connection check</p>
        <button type="button" onClick={run} disabled={pending} className="text-[11px] font-semibold text-ink/70 hover:text-ink disabled:opacity-60">
          {pending ? "Checking…" : check ? "Check again" : "Run check"}
        </button>
      </div>
      {error && <p role="alert" className="mt-1.5 text-[11px] text-warning-text">{error}</p>}
      {!check && !error && <p className="mt-1 text-[11px] text-ink/65">Confirms the account, the Daythread folder and what is in it.</p>}
      {check && (
        <>
          <ul className="mt-2 space-y-1.5">
            <Row label="Account" ok={Boolean(check.account)} detail={check.account ?? "Not reported"} />
            <Row label="Daythread folder" ok={check.rootFolder.reachable} detail={check.rootFolder.reachable ? "Reachable" : "Could not be reached"} href={check.rootFolder.url} />
            <Row label="Client folders" ok={check.clientFolders !== null} detail={check.clientFolders === null ? "Unknown" : `${check.clientFolders} so far`} />
          </ul>
          {check.problem ? (
            <p className="mt-2 text-[11px] text-warning-text leading-relaxed border-t border-border pt-2">{check.problem}</p>
          ) : (
            <p className="mt-2 text-[11px] text-success-text border-t border-border pt-2">Working. Client folders can be created, shared and sent.</p>
          )}
          <p className="mt-1 text-[10px] text-ink/50">Checked {new Date(check.checkedAt).toLocaleString()}</p>
        </>
      )}
    </div>
  );
}

function Row({ label, ok, detail, href }: { label: string; ok: boolean; detail: string; href?: string | null }) {
  return (
    <li className="flex gap-2 items-start">
      <span aria-hidden className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${ok ? "bg-success" : "bg-warning"}`} />
      <span className="min-w-0">
        <span className="text-ink/80">{label}</span>
        <span className="block text-[11px] text-ink/65 leading-snug break-all">
          {href ? (
            <Link href={href} target="_blank" rel="noreferrer" className="hover:underline">
              {detail}
            </Link>
          ) : (
            detail
          )}
        </span>
      </span>
    </li>
  );
}
