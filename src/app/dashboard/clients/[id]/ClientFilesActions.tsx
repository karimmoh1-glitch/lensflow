"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui";
import { useToast } from "@/components/Toaster";
import { createClientFolder, shareClientFiles, sendClientFiles } from "@/app/actions/clientFiles";
import type { FileProvider } from "@/server/clientFiles";

export type FilesActionModel = {
  provider: FileProvider;
  name: string;
  hasFolder: boolean;
  url: string | null;
  sharedWith: string | null;
  deliveredAt: string | null;
  clientHasContact: boolean;
};

/**
 * Everything a business does with a client's folder, in the order they do it: make it, let
 * the client in, send them the link. Each step says what happened, and nothing claims to
 * have sent a message that did not send.
 */
export function ClientFilesActions({ clientId, model }: { clientId: string; model: FilesActionModel }) {
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();
  const { toast } = useToast();

  const run = (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    start(async () => {
      await fn();
      setBusy(null);
      router.refresh();
    });
  };

  const create = () =>
    run("create", async () => {
      const r = await createClientFolder(clientId, model.provider);
      if (!r.ok) return toast({ tone: "signal", title: "Couldn't create the folder", body: r.error });
      toast({ tone: "outcome", title: `Folder created in ${model.name}` });
    });

  const share = () =>
    run("share", async () => {
      const r = await shareClientFiles(clientId, model.provider);
      if (!r.ok) return toast({ tone: "signal", title: "Couldn't share the folder", body: r.error });
      toast({ tone: "outcome", title: r.sharedWith ? `Shared with ${r.sharedWith}` : "Link ready", body: r.note ?? undefined });
    });

  const send = () =>
    run("send", async () => {
      const r = await sendClientFiles(clientId, model.provider, message);
      if (!r.ok) return toast({ tone: "signal", title: "Couldn't send the link", body: r.error });
      setComposing(false);
      setMessage("");
      if (r.notified === "sent") toast({ tone: "outcome", title: `Link sent by ${r.via.toLowerCase()}`, body: r.note ?? undefined });
      else toast({ tone: "signal", title: "Shared, but not sent", body: r.note ?? "Copy the link and send it yourself." });
    });

  const copy = async () => {
    if (!model.url) return;
    try {
      await navigator.clipboard.writeText(model.url);
      toast({ tone: "neutral", title: "Link copied" });
    } catch {
      toast({ tone: "signal", title: "Couldn't copy", body: "Open the folder and copy the address from there." });
    }
  };

  if (!model.hasFolder) {
    return (
      <button type="button" onClick={create} disabled={pending} className="text-xs font-semibold text-ink/70 hover:text-ink disabled:opacity-60">
        {busy === "create" ? "Creating…" : "Create folder"}
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 justify-end">
      {model.url && (
        <Link href={model.url} target="_blank" rel="noreferrer" className="text-xs font-semibold text-ink/70 hover:text-ink">
          Open
        </Link>
      )}
      {model.url && (
        <button type="button" onClick={copy} className="text-xs font-semibold text-ink/70 hover:text-ink">
          Copy link
        </button>
      )}
      <button type="button" onClick={share} disabled={pending} className="text-xs font-semibold text-ink/70 hover:text-ink disabled:opacity-60">
        {busy === "share" ? "Sharing…" : model.sharedWith ? "Re-share" : "Share with client"}
      </button>
      {model.clientHasContact && (
        <button type="button" onClick={() => setComposing((v) => !v)} className="text-xs font-semibold text-ink/70 hover:text-ink">
          {composing ? "Cancel" : model.deliveredAt ? "Send again" : "Send link"}
        </button>
      )}
      {composing && (
        <div className="w-full mt-1.5 space-y-1.5">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder="A line for the client (optional)"
            className="w-full rounded-xl border border-border px-3 py-2 text-[13px] text-ink placeholder:text-ink/40 focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
          <Button size="sm" onClick={send} loading={pending && busy === "send"} loadingLabel="Sending">
            Send the link
          </Button>
        </div>
      )}
    </div>
  );
}
