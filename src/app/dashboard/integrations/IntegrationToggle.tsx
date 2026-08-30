"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { toggleIntegration } from "@/app/actions/integrations";
import type { IntegrationProvider } from "@prisma/client";

export function IntegrationToggle({ provider, connected }: { provider: IntegrationProvider; connected: boolean }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <Button
      size="sm"
      variant={connected ? "outline" : "primary"}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await toggleIntegration(provider, !connected);
          router.refresh();
        })
      }
    >
      {connected ? "Disconnect" : "Connect"}
    </Button>
  );
}
