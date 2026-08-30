"use client";

import { useState, useTransition } from "react";
import { Card, CardBody, Label, Input, Textarea, SaveButton } from "@/components/ui";
import { updatePaymentSettings } from "@/app/actions/settings";
import type { Business } from "@prisma/client";

const METHODS = [
  { key: "card", label: "Card / Apple Pay" },
  { key: "zelle", label: "Zelle" },
  { key: "bank_transfer", label: "Bank transfer" },
];

export function PaymentSettingsForm({ business }: { business: Business }) {
  const [depositPercent, setDepositPercent] = useState(business.depositPercent);
  const [paymentMethods, setPaymentMethods] = useState<string[]>(business.paymentMethods);
  const [zelleHandle, setZelleHandle] = useState(business.zelleHandle ?? "");
  const [bankInstructions, setBankInstructions] = useState(business.bankInstructions ?? "");
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  return (
    <Card>
      <CardBody className="space-y-4">
        <div className="space-y-2">
          {METHODS.map((m) => (
            <label key={m.key} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={paymentMethods.includes(m.key)}
                onChange={() => setPaymentMethods((prev) => (prev.includes(m.key) ? prev.filter((x) => x !== m.key) : [...prev, m.key]))}
              />
              <span className="text-sm font-medium">{m.label}</span>
            </label>
          ))}
        </div>
        <div>
          <Label>Deposit required ({depositPercent}%)</Label>
          <input type="range" min={0} max={100} step={5} value={depositPercent} onChange={(e) => setDepositPercent(Number(e.target.value))} className="w-full" />
        </div>
        {paymentMethods.includes("zelle") && (
          <div>
            <Label>Zelle destination</Label>
            <Input value={zelleHandle} onChange={(e) => setZelleHandle(e.target.value)} placeholder="you@studio.com or (555) 555-5555" />
          </div>
        )}
        {paymentMethods.includes("bank_transfer") && (
          <div>
            <Label>Bank transfer instructions</Label>
            <Textarea value={bankInstructions} onChange={(e) => setBankInstructions(e.target.value)} rows={3} placeholder="Account name, routing/account number, bank name…" />
          </div>
        )}
        <SaveButton
          pending={pending}
          saved={saved}
          onClick={() =>
            startTransition(async () => {
              await updatePaymentSettings({ depositPercent, paymentMethods, zelleHandle, bankInstructions });
              setSaved(true);
              setTimeout(() => setSaved(false), 2000);
            })
          }
        >
          Save payment settings
        </SaveButton>
      </CardBody>
    </Card>
  );
}
