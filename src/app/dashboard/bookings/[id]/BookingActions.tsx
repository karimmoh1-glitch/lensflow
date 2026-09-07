"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardBody, Button } from "@/components/ui";
import { useToast } from "@/components/Toaster";
import { advanceBookingStatus, sendQuestionnaire } from "@/app/actions/bookings";
import type { BookingStatus } from "@prisma/client";

/** The booking's lifecycle, one honest button at a time. Every click is a server action
 * that re-checks the transition; nothing here changes state on its own. */
export function BookingActions({ bookingId, status, hasQuestionnaire }: { bookingId: string; status: BookingStatus; hasQuestionnaire: boolean }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const { toast } = useToast();

  function doAdvance(next: BookingStatus, title: string) {
    startTransition(async () => {
      try {
        await advanceBookingStatus(bookingId, next);
        toast({ tone: "outcome", title });
        router.refresh();
      } catch (err) {
        toast({ tone: "signal", title: "Couldn't update the booking", body: err instanceof Error ? err.message : undefined });
      }
    });
  }
  function doQuestionnaire() {
    startTransition(async () => {
      try {
        await sendQuestionnaire(bookingId);
        toast({ tone: "outcome", title: "Questionnaire sent" });
        router.refresh();
      } catch (err) {
        toast({ tone: "signal", title: "Couldn't send the questionnaire", body: err instanceof Error ? err.message : undefined });
      }
    });
  }

  const next: Array<{ show: boolean; label: string; to: BookingStatus; done: string }> = [
    { show: status === "INQUIRY", label: "Mark as booked", to: "BOOKED", done: "Marked as booked" },
    { show: status === "BOOKED", label: "Confirm booking", to: "CONFIRMED", done: "Booking confirmed" },
    { show: status === "CONFIRMED" || status === "QUESTIONNAIRE_COMPLETE", label: "Mark as upcoming", to: "UPCOMING", done: "Marked as upcoming" },
    { show: status === "UPCOMING", label: "Mark completed", to: "COMPLETED", done: "Marked completed" },
    { show: status === "COMPLETED", label: "Mark follow-up sent", to: "FOLLOWED_UP", done: "Follow-up recorded" },
  ];

  return (
    <Card>
      <CardBody className="space-y-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-ink/60">Actions</div>
        {next.filter((n) => n.show).map((n) => (
          <Button key={n.to} size="sm" className="w-full" onClick={() => doAdvance(n.to, n.done)} loading={pending} loadingLabel="Saving">{n.label}</Button>
        ))}
        {!hasQuestionnaire && status !== "INQUIRY" && status !== "CANCELED" && (
          <Button size="sm" variant="outline" className="w-full" onClick={doQuestionnaire} disabled={pending}>Send questionnaire</Button>
        )}
        {status === "CANCELED" && <p className="text-xs text-ink/50">This booking was canceled.</p>}
        {status === "FOLLOWED_UP" && <p className="text-xs text-ink/50">All done here.</p>}
      </CardBody>
    </Card>
  );
}
