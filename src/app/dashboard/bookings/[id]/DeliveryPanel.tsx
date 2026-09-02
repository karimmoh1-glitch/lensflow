"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardBody, Button, Input, Label, Badge } from "@/components/ui";
import { ExternalLink, CheckCircle2 } from "lucide-react";
import { markDelivered } from "@/app/actions/bookings";
import { format } from "date-fns";

export function DeliveryPanel({
  bookingId,
  deliveryUrl,
  deliveryNote,
  deliveredAt,
}: {
  bookingId: string;
  deliveryUrl: string | null;
  deliveryNote: string | null;
  deliveredAt: Date | null;
}) {
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function submit() {
    setError(null);
    startTransition(async () => {
      try {
        await markDelivered(bookingId, url, note || undefined);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Enter a valid delivery URL.");
      }
    });
  }

  return (
    <Card>
      <CardBody>
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-ink/40">Delivery</div>
          {deliveryUrl ? <Badge tone="success">Delivered</Badge> : <Badge tone="neutral">Not delivered</Badge>}
        </div>

        {deliveryUrl ? (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs text-success-text">
              <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={2} />
              {deliveredAt ? `Delivered ${format(deliveredAt, "MMM d, yyyy")}` : "Delivered"}
            </div>
            {deliveryNote && <p className="text-sm text-ink/70">{deliveryNote}</p>}
            <a
              href={deliveryUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 text-sm text-accent-text hover:underline bg-black/[0.03] rounded-lg px-3 py-2.5 break-all"
            >
              <ExternalLink className="w-3.5 h-3.5 shrink-0" strokeWidth={2} />
              {deliveryUrl}
            </a>
          </div>
        ) : (
          <div className="space-y-2.5">
            <p className="text-xs text-ink/50">Paste the delivery link once the work is ready — Google Drive, Dropbox, Pixieset, whatever you use.</p>
            <div>
              <Label htmlFor="deliveryUrl">Delivery URL</Label>
              <Input id="deliveryUrl" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://drive.google.com/…" />
            </div>
            <div>
              <Label htmlFor="deliveryNote">Note (optional)</Label>
              <Input id="deliveryNote" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Final files, high-res + web" />
            </div>
            {error && <p className="text-xs text-danger">{error}</p>}
            <Button size="sm" className="w-full" onClick={submit} disabled={pending || !url}>
              Mark as delivered
            </Button>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
