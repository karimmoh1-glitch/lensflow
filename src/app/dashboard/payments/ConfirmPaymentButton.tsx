"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { confirmPayment } from "@/app/actions/bookings";

export function ConfirmPaymentButton({ paymentId }: { paymentId: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <Button
      size="sm"
      variant="secondary"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await confirmPayment(paymentId);
          router.refresh();
        })
      }
    >
      {pending ? "Confirming…" : "Confirm payment"}
    </Button>
  );
}
