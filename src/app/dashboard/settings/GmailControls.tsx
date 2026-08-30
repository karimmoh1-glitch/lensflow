"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { connectGoogle, disconnectGoogle, syncGmailNow } from "@/app/actions/googleAuth";

export function GoogleConnectButton() {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      disabled={pending}
      onClick={() => startTransition(() => connectGoogle())}
    >
      {pending ? "Redirecting…" : "Connect with Gmail"}
    </Button>
  );
}

export function GmailConnectedControls() {
  const [pending, startTransition] = useTransition();
  const [syncing, startSync] = useTransition();
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const router = useRouter();

  return (
    <div className="flex items-center gap-2 shrink-0">
      {syncMessage && <span className="text-xs text-ink/45">{syncMessage}</span>}
      <Button
        size="sm"
        variant="outline"
        disabled={syncing}
        onClick={() =>
          startSync(async () => {
            setSyncMessage(null);
            const result = await syncGmailNow();
            if (result.ok) {
              setSyncMessage(result.ingested > 0 ? `${result.ingested} new message${result.ingested === 1 ? "" : "s"}` : "No new messages");
            } else {
              setSyncMessage(`Sync failed: ${result.error}`);
            }
            router.refresh();
          })
        }
      >
        {syncing ? "Checking…" : "Check for new emails"}
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            await disconnectGoogle();
            router.refresh();
          })
        }
      >
        Disconnect
      </Button>
    </div>
  );
}
