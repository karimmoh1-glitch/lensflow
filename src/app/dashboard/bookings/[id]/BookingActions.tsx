"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardBody, Button, Select } from "@/components/ui";
import { advanceBookingStatus, requestPayment, sendQuestionnaire } from "@/app/actions/bookings";
import { getOrCreateInvoice } from "@/app/actions/invoices";
import type { BookingStatus, PaymentMethodType, PaymentPurpose } from "@prisma/client";

const METHOD_LABEL: Record<string, string> = { card: "Card / Apple Pay", zelle: "Zelle", bank_transfer: "Bank transfer" };
const METHOD_VALUE: Record<string, PaymentMethodType> = { card: "CARD", zelle: "ZELLE", bank_transfer: "BANK_TRANSFER" };

export function BookingActions({
  bookingId,
  status,
  remainingCents,
  depositCents,
  paymentMethods,
  hasQuestionnaire,
}: {
  bookingId: string;
  status: BookingStatus;
  remainingCents: number;
  depositCents: number;
  paymentMethods: string[];
  hasQuestionnaire: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [purpose, setPurpose] = useState<PaymentPurpose>(status === "BOOKED" ? "DEPOSIT" : "BALANCE");
  const [method, setMethod] = useState(paymentMethods[0] ?? "card");
  const [checkoutInfo, setCheckoutInfo] = useState<{ url: string | null; reference: string | null } | null>(null);
  const router = useRouter();

  const amountCents = purpose === "DEPOSIT" ? depositCents : remainingCents;

  function doAdvance(next: BookingStatus) {
    startTransition(async () => {
      await advanceBookingStatus(bookingId, next);
      router.refresh();
    });
  }

  function doRequestPayment() {
    startTransition(async () => {
      const result = await requestPayment({ bookingId, purpose, method: METHOD_VALUE[method], amountCents });
      setCheckoutInfo({ url: result.checkoutUrl, reference: result.reference });
      router.refresh();
    });
  }

  function doQuestionnaire() {
    startTransition(async () => {
      await sendQuestionnaire(bookingId);
      router.refresh();
    });
  }

  function viewInvoice() {
    startTransition(async () => {
      const invoiceId = await getOrCreateInvoice(bookingId);
      router.push(`/dashboard/invoices/${invoiceId}`);
    });
  }

  return (
    <Card>
      <CardBody className="space-y-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-ink/60">Actions</div>

        {status === "INQUIRY" && (
          <Button size="sm" className="w-full" onClick={() => doAdvance("BOOKED")} disabled={pending}>
            Mark as booked
          </Button>
        )}
        {status === "DEPOSIT_PAID" && (
          <Button size="sm" className="w-full" onClick={() => doAdvance("CONFIRMED")} disabled={pending}>
            Confirm booking
          </Button>
        )}
        {(status === "CONFIRMED" || status === "QUESTIONNAIRE_COMPLETE") && (
          <Button size="sm" className="w-full" onClick={() => doAdvance("UPCOMING")} disabled={pending}>
            Mark as upcoming
          </Button>
        )}
        {status === "UPCOMING" && (
          <Button size="sm" className="w-full" onClick={() => doAdvance("COMPLETED")} disabled={pending}>
            Mark completed
          </Button>
        )}
        {status === "BALANCE_PAID" && (
          <Button size="sm" className="w-full" onClick={() => doAdvance("FOLLOWED_UP")} disabled={pending}>
            Mark follow-up sent
          </Button>
        )}

        {!hasQuestionnaire && status !== "INQUIRY" && (
          <Button size="sm" variant="outline" className="w-full" onClick={doQuestionnaire} disabled={pending}>
            Send questionnaire
          </Button>
        )}

        {status !== "INQUIRY" && (
          <Button size="sm" variant="outline" className="w-full" onClick={viewInvoice} disabled={pending}>
            View invoice
          </Button>
        )}

        {remainingCents > 0 && paymentMethods.length > 0 && (
          <div className="pt-3 border-t border-border space-y-2">
            <div className="text-xs font-medium text-ink/60">Request payment</div>
            <Select value={purpose} onChange={(e) => setPurpose(e.target.value as PaymentPurpose)}>
              {depositCents > 0 && status === "BOOKED" && <option value="DEPOSIT">Deposit — ${(depositCents / 100).toFixed(0)}</option>}
              <option value="BALANCE">Balance — ${(remainingCents / 100).toFixed(0)}</option>
            </Select>
            <Select value={method} onChange={(e) => setMethod(e.target.value)}>
              {paymentMethods.map((m) => (
                <option key={m} value={m}>
                  {METHOD_LABEL[m]}
                </option>
              ))}
            </Select>
            <Button size="sm" variant="secondary" className="w-full" onClick={doRequestPayment} disabled={pending}>
              Send payment request
            </Button>
            {checkoutInfo && (
              <div className="text-xs text-ink/70 bg-black/[0.03] rounded-lg p-2.5">
                {checkoutInfo.url && (
                  <>
                    Checkout link:{" "}
                    <a href={checkoutInfo.url} target="_blank" className="text-accent-text underline break-all">
                      {checkoutInfo.url}
                    </a>
                  </>
                )}
                {checkoutInfo.reference && <div>Reference: {checkoutInfo.reference} — awaiting confirmation</div>}
              </div>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
