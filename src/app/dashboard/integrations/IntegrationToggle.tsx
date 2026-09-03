"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { toggleIntegration } from "@/app/actions/integrations";
import type { IntegrationProvider } from "@prisma/client";

export function IntegrationToggle({ provider, connected }: { provider: IntegrationProvider; connected: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

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
              await toggleIntegration(provider, !connected);
              router.refresh();
            } catch (err) {
              setError(err instanceof Error ? err.message : "Something went wrong.");
            }
          })
        }
      >
        {connected ? "Disconnect" : "Connect"}
      </Button>
      {error && <p className="text-xs text-danger-text max-w-[200px] text-right">{error}</p>}
    </div>
  );
}
