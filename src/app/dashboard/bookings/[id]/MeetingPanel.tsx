"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Video } from "lucide-react";
import { Button, Card, CardBody } from "@/components/ui";
import { useToast } from "@/components/Toaster";
import { createZoomMeeting, startZoomMeeting, removeZoomMeeting } from "@/app/actions/meetings";

/**
 * The booking's video meeting. Everything that touches Zoom happens on the server with the
 * workspace's own connection; this component only ever holds the join link (which the
 * client gets anyway) and opens the host's start link the moment Zoom hands it back.
 */
export function MeetingPanel({ bookingId, joinUrl, zoom, canCreate }: { bookingId: string; joinUrl: string | null; zoom: "connected" | "needs_attention" | "not_connected"; canCreate: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<null | "create" | "start" | "remove">(null);
  const router = useRouter();
  const { toast } = useToast();

  function run(kind: "create" | "start" | "remove", fn: () => Promise<void>) {
    setError(null);
    setBusy(kind);
    start(async () => {
      try {
        await fn();
      } catch {
        setError("Something went wrong. Try again.");
      } finally {
        setBusy(null);
      }
    });
  }

  const create = () => run("create", async () => {
    const r = await createZoomMeeting(bookingId);
    if (!r.ok) return setError(r.error);
    toast({ tone: "outcome", title: r.created ? "Zoom meeting created" : "This booking already has a meeting", body: "The join link is on the booking and in your connected calendars." });
    router.refresh();
  });
  const startMeeting = () => {
    // Opened before the request so the browser treats it as a user-initiated window.
    const win = window.open("about:blank", "_blank");
    run("start", async () => {
      const r = await startZoomMeeting(bookingId);
      if (!r.ok) { win?.close(); return setError(r.error); }
      if (win) { win.opener = null; win.location.href = r.url; } else window.location.href = r.url;
    });
  };
  const remove = () => run("remove", async () => {
    if (!window.confirm("Remove the Zoom meeting? It will be deleted in Zoom and the join link will stop working.")) return;
    const r = await removeZoomMeeting(bookingId);
    if (!r.ok) return setError(r.error);
    toast({ tone: "neutral", title: "Zoom meeting removed" });
    router.refresh();
  });
  const copy = async () => {
    if (!joinUrl) return;
    try {
      await navigator.clipboard.writeText(joinUrl);
      toast({ tone: "neutral", title: "Join link copied" });
    } catch {
      setError("Couldn't copy. Select the link and copy it yourself.");
    }
  };

  return (
    <Card>
      <CardBody>
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink/65 mb-3">
          <Video className="w-3.5 h-3.5" strokeWidth={2} aria-hidden /> Video meeting
        </div>
        {joinUrl ? (
          <div className="space-y-3">
            <a href={joinUrl} target="_blank" rel="noopener noreferrer" className="block text-sm font-medium break-all hover:underline">{joinUrl}</a>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={startMeeting} loading={pending && busy === "start"} loadingLabel="Opening" disabled={pending || zoom === "not_connected"}>Start in Zoom</Button>
              <Button size="sm" variant="secondary" onClick={copy} disabled={pending}>Copy join link</Button>
              <Button size="sm" variant="ghost" onClick={remove} loading={pending && busy === "remove"} loadingLabel="Removing" disabled={pending}>Remove</Button>
            </div>
          </div>
        ) : zoom === "not_connected" ? (
          <p className="text-sm text-ink/75">Connect Zoom to add a meeting link to this booking. <Link href="/dashboard/settings?tab=channels" className="font-medium underline">Connect Zoom</Link></p>
        ) : zoom === "needs_attention" ? (
          <p className="text-sm text-ink/75">Zoom needs reconnecting before a meeting can be made. <Link href="/dashboard/settings?tab=channels" className="font-medium underline">Reconnect</Link></p>
        ) : canCreate ? (
          <Button size="sm" onClick={create} loading={pending && busy === "create"} loadingLabel="Creating" disabled={pending}>Create Zoom meeting</Button>
        ) : (
          <p className="text-sm text-ink/75">Meetings can only be added to upcoming bookings.</p>
        )}
        {zoom === "needs_attention" && joinUrl && <p className="mt-2 text-xs text-ink/70">Zoom needs reconnecting. The join link still works, but moving or removing the meeting won&apos;t reach Zoom until you reconnect.</p>}
        {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
      </CardBody>
    </Card>
  );
}
