"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui";
import { payOutstanding } from "@/app/actions/portal";

export function PayButton({ paymentId }: { paymentId: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await payOutstanding(paymentId);
          if (result.checkoutUrl) window.location.href = result.checkoutUrl;
        })
      }
    >
      {pending ? "Redirecting…" : "Pay now"}
    </Button>
  );
}
