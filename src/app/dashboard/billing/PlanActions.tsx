"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { startUpgradeCheckout, openBillingPortal } from "@/app/actions/billing";
import type { PlanKey } from "@/lib/billing";

export function UpgradeButton({ planKey, children }: { planKey: Extract<PlanKey, "PRO" | "BUSINESS">; children: React.ReactNode }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [changed, setChanged] = useState(false);
  const router = useRouter();

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await startUpgradeCheckout(planKey);
      if (result.url) {
        window.location.href = result.url;
        return;
      }
      if (result.changed) {
        setChanged(true);
        router.refresh();
        return;
      }
      setError(result.error ?? "Something went wrong.");
    });
  }

  return (
    <div>
      <Button className="w-full" disabled={pending} onClick={handleClick}>
        {pending ? "Updating…" : changed ? "Plan changed" : children}
      </Button>
      {error && <p className="text-xs text-danger mt-2">{error}</p>}
    </div>
  );
}

export function ManageBillingButton() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await openBillingPortal();
      if (result.url) {
        window.location.href = result.url;
        return;
      }
      setError(result.error ?? "Something went wrong.");
    });
  }

  return (
    <div>
      <Button variant="outline" size="sm" disabled={pending} onClick={handleClick}>
        {pending ? "Opening…" : "Manage billing"}
      </Button>
      {error && <p className="text-xs text-danger mt-2">{error}</p>}
    </div>
  );
}
