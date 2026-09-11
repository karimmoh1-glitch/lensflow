"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardBody, Button, Input, Label, Badge } from "@/components/ui";
import { ExternalLink, CheckCircle2 } from "lucide-react";
import { markDelivered } from "@/app/actions/bookings";
import { sendClientFiles } from "@/app/actions/clientFiles";
import { useToast } from "@/components/Toaster";
import type { FileProvider } from "@/server/clientFiles";
import { format } from "date-fns";

/**
 * Getting the work to the customer. When the workspace has a file store connected, this is
 * one button: Daythread makes their folder, lets them in by name, sends them the link and
 * marks the booking delivered. Pasting a link by hand stays for everyone else, because
 * plenty of businesses deliver through something Daythread has never heard of.
 */
export function DeliveryPanel({
  bookingId,
  clientId,
  clientName,
  clientHasContact,
  fileStore,
  deliveryUrl,
  deliveryNote,
  deliveredAt,
}: {
  bookingId: string;
  clientId: string;
  clientName: string;
  clientHasContact: boolean;
  fileStore: { provider: FileProvider; name: string } | null;
  deliveryUrl: string | null;
  deliveryNote: string | null;
  deliveredAt: Date | null;
}) {
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const { toast } = useToast();

  const first = clientName.split(" ")[0] || "them";

  function sendFromStore() {
    if (!fileStore) return;
    setError(null);
    startTransition(async () => {
      const r = await sendClientFiles(clientId, fileStore.provider, note || undefined, bookingId);
      router.refresh();
      if (!r.ok) return toast({ tone: "signal", title: "Couldn't send the files", body: r.error });
      if (r.notified === "sent") toast({ tone: "outcome", title: `Sent to ${first} by ${r.via.toLowerCase()}`, body: r.note ?? undefined });
      else toast({ tone: "signal", title: "Shared, but not sent", body: r.note ?? "Copy the link and send it yourself." });
    });
  }

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
          <div className="text-xs font-semibold uppercase tracking-wide text-ink/65">Delivery</div>
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
            {fileStore && !manual ? (
              <>
                <p className="text-xs text-ink/70">
                  {clientHasContact
                    ? `Daythread will make ${first}'s folder in ${fileStore.name}, give them access, send them the link and mark this delivered.`
                    : `${first} has no email address or phone number yet, so there is nowhere to send the link. Add one on their profile first.`}
                </p>
                <div>
                  <Label htmlFor="deliveryNote">A line for {first} (optional)</Label>
                  <Input id="deliveryNote" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Final files, high-res and web" />
                </div>
                <Button size="sm" className="w-full" onClick={sendFromStore} disabled={pending || !clientHasContact} loading={pending} loadingLabel="Sending">
                  Send {first} their files
                </Button>
                <button type="button" className="text-xs font-semibold text-ink/65 hover:text-ink" onClick={() => setManual(true)}>
                  Or paste a link from somewhere else
                </button>
              </>
            ) : (
              <>
            <p className="text-xs text-ink/70">Paste the delivery link once the work is ready — Google Drive, Dropbox, whatever you use.</p>
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
            {fileStore && (
              <button type="button" className="text-xs font-semibold text-ink/65 hover:text-ink" onClick={() => setManual(false)}>
                Back to sending from {fileStore.name}
              </button>
            )}
              </>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
