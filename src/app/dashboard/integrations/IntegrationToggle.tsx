"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { toggleIntegration } from "@/app/actions/integrations";
import type { IntegrationProvider } from "@prisma/client";
import { EntitlementNotice } from "@/components/UpgradePrompt";
import { useToast } from "@/components/Toaster";

export function IntegrationToggle({ provider, connected }: { provider: IntegrationProvider; connected: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { toast } = useToast();

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        variant={connected ? "outline" : "primary"}
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            try {
              const res = await toggleIntegration(provider, !connected);
              if (res?.error) {
                setError(res.error);
                return;
              }
              toast({ tone: connected ? "neutral" : "outcome", title: connected ? "Disconnected" : "Connected", body: connected ? "Messages from this channel will stop arriving here." : "New messages on this channel now land in your inbox." });
              router.refresh();
            } catch {
              setError("Couldn't update this connection. Nothing was changed — try again.");
            }
          })
        }
      >
        {connected ? "Disconnect" : "Connect"}
      </Button>
      {error && <EntitlementNotice message={error} />}
    </div>
  );
}
