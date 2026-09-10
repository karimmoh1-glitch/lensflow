"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClientFolder } from "@/app/actions/clientFiles";
import { useToast } from "@/components/Toaster";

export function CreateFolderButton({ clientId, provider }: { clientId: string; provider: "GOOGLE_DRIVE" | "DROPBOX" }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(async () => {
        const r = await createClientFolder(clientId, provider);
        if (!r.ok) return toast({ tone: "signal", title: "Couldn't create the folder", body: r.error });
        toast({ tone: "outcome", title: "Folder created" });
        router.refresh();
      })}
      className="text-xs font-semibold text-ink/70 hover:text-ink disabled:opacity-60"
    >
      {pending ? "Creating…" : "Create folder"}
    </button>
  );
}
