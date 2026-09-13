import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { requireBusiness } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { MapPin } from "lucide-react";
import { Card, CardBody, PageHeader } from "@/components/ui";
import { ConversationLink } from "./ConversationLink";
import { formatMoney, toZonedDisplayDate } from "@/lib/utils";
import { format } from "date-fns";
import { BookingActions } from "./BookingActions";
import { RescheduleCancel } from "./RescheduleCancel";
import { AssignPartner } from "./AssignPartner";
import { DeliveryPanel } from "./DeliveryPanel";
import { MeetingPanel } from "./MeetingPanel";

const LIFECYCLE: { status: string; label: string }[] = [
  { status: "INQUIRY", label: "Inquiry" },
  { status: "BOOKED", label: "Booked" },
  { status: "CONFIRMED", label: "Confirmed" },
  { status: "QUESTIONNAIRE_COMPLETE", label: "Questionnaire" },
  { status: "UPCOMING", label: "Upcoming" },
  { status: "COMPLETED", label: "Completed" },
  { status: "FOLLOWED_UP", label: "Followed up" },
];

export default async function BookingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireBusiness();
  if (!ctx) redirect("/login");
  const { business, role, membership } = ctx;
  const { id } = await params;

  // Clients use /portal for their own bookings, never this staff-facing detail page —
  // never trust the URL alone to gate access.
  if (role === "CLIENT") redirect("/portal");

  const booking = await prisma.booking.findFirst({
    where: { id, businessId: business.id },
    include: { client: true, service: true },
  });
  if (!booking) notFound();

  // A partner can only ever see the bookings explicitly assigned to them — the same
  // least-privilege scoping /partner enforces in its list view, re-checked here since a
  // partner could otherwise reach any booking by guessing its URL.
  if (role === "PARTNER" && booking.assignedMembershipId !== membership.id) notFound();

  const [partners, fileStores, zoomRow] = await Promise.all([
    prisma.orgMembership.findMany({ where: { businessId: business.id, role: "PARTNER" }, include: { user: true } }),
    // Daythread already knows how to make this person's folder, let them into it and send
    // it. Until now the booking asked the owner to paste a link by hand instead, so the
    // flagship workflow was unreachable from the place the work actually finishes.
    prisma.integration.findMany({
      where: { businessId: business.id, provider: { in: ["GOOGLE_DRIVE", "DROPBOX"] }, status: { in: ["CONNECTED", "SYNC_ERROR"] } },
      select: { provider: true },
    }),
    prisma.integration.findUnique({ where: { businessId_provider: { businessId: business.id, provider: "ZOOM" } }, select: { status: true, refreshToken: true } }),
  ]);
  const fileStore = fileStores.find((r) => r.provider === "GOOGLE_DRIVE") ?? fileStores[0] ?? null;

  const zoom: "connected" | "needs_attention" | "not_connected" = !zoomRow || zoomRow.status === "NOT_CONNECTED" ? "not_connected" : zoomRow.status === "NEEDS_ATTENTION" || !zoomRow.refreshToken ? "needs_attention" : "connected";
  // Staff only, and only where there is something to show: a meeting that exists, or a
  // connected Zoom account. Partners see the join link but cannot act on the account.
  const meetingJoinUrl = booking.meetingProvider === "ZOOM" ? booking.meetingJoinUrl : null;
  const showMeeting = meetingJoinUrl !== null || (zoom !== "not_connected" && role !== "PARTNER");
  const currentIndex = LIFECYCLE.findIndex((s) => s.status === booking.status);

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-8 py-6 md:py-10">
      <PageHeader
        title={`${booking.client.name} — ${booking.service.name}`}
        description={format(toZonedDisplayDate(booking.startAt, business.timezone), "EEEE, MMMM d, yyyy · h:mm a")}
      />

      {booking.status !== "CANCELED" && currentIndex >= 0 && (
        <div className="mb-8 max-w-xl" aria-label={`Stage: ${LIFECYCLE[currentIndex].label}, step ${currentIndex + 1} of ${LIFECYCLE.length}`}>
          <div className="flex items-baseline justify-between text-13">
            <span className="font-semibold text-ink">{LIFECYCLE[currentIndex].label}</span>
            {currentIndex < LIFECYCLE.length - 1 && <span className="text-ink/60">Next: {LIFECYCLE[currentIndex + 1].label}</span>}
          </div>
          <div aria-hidden className="mt-2 grid gap-1" style={{ gridTemplateColumns: `repeat(${LIFECYCLE.length}, minmax(0, 1fr))` }}>
            {LIFECYCLE.map((step, i) => <span key={step.status} title={step.label} className={`h-1 rounded-full ${i <= currentIndex ? "bg-ink" : "bg-black/[0.08]"}`} />)}
          </div>
        </div>
      )}
      {booking.status === "CANCELED" && <p className="mb-8 text-13 font-medium text-ink/60">Canceled</p>}

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardBody>
              <div className="text-13 font-semibold text-ink/65 mb-3">Details</div>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between"><dt className="text-ink/75">Service</dt><dd className="font-medium">{booking.service.name}</dd></div>
                <div className="flex justify-between"><dt className="text-ink/75">When</dt><dd className="font-medium">{format(toZonedDisplayDate(booking.startAt, business.timezone), "EEE, MMM d · h:mm a")} – {format(toZonedDisplayDate(booking.endAt, business.timezone), "h:mm a")}</dd></div>
                {booking.location && <div className="flex justify-between"><dt className="text-ink/75">Where</dt><dd className="font-medium">{booking.location}</dd></div>}
                <div className="flex justify-between"><dt className="text-ink/75">Price</dt><dd className="font-medium">{formatMoney(booking.totalCents)}</dd></div>
                {booking.externalCalendarProvider && <div className="flex justify-between"><dt className="text-ink/75">On your calendar</dt><dd className="font-medium">{booking.externalCalendarProvider === "GOOGLE_CALENDAR" ? "Google Calendar" : "Apple Calendar"}</dd></div>}
              </dl>
              <div className="mt-4 pt-4 border-t border-border"><ConversationLink businessId={booking.businessId} bookingId={booking.id} conversationId={booking.conversationId} clientId={booking.clientId} /></div>
            </CardBody>
          </Card>

          {showMeeting && (role === "PARTNER" ? (
            <Card>
              <CardBody>
                <div className="text-13 font-semibold text-ink/65 mb-3">Video meeting</div>
                <a href={meetingJoinUrl!} target="_blank" rel="noopener noreferrer" className="text-sm font-medium break-all hover:underline">{meetingJoinUrl}</a>
              </CardBody>
            </Card>
          ) : (
            <MeetingPanel bookingId={booking.id} joinUrl={meetingJoinUrl} zoom={zoom} canCreate={booking.status !== "CANCELED" && booking.endAt > new Date()} />
          ))}


          {(["COMPLETED", "BALANCE_PAID", "FOLLOWED_UP"].includes(booking.status) || booking.deliveryUrl) && (
            <DeliveryPanel
              bookingId={booking.id}
              clientId={booking.client.id}
              clientName={booking.client.name}
              clientHasContact={Boolean(booking.client.email || booking.client.phone)}
              fileStore={fileStore ? { provider: fileStore.provider as "GOOGLE_DRIVE" | "DROPBOX", name: fileStore.provider === "DROPBOX" ? "Dropbox" : "Google Drive" } : null}
              deliveryUrl={booking.deliveryUrl}
              deliveryNote={booking.deliveryNote}
              deliveredAt={booking.deliveredAt}
            />
          )}
        </div>

        <div>
          <Card>
            <CardBody>
              <div className="text-13 font-semibold text-ink/65 mb-3">Client</div>
              <Link href={`/dashboard/clients/${booking.clientId}`} className="font-medium text-sm hover:underline">
                {booking.client.name}
              </Link>
              {booking.client.email && <div className="text-xs text-ink/70 mt-0.5">{booking.client.email}</div>}
              {booking.client.phone && <div className="text-xs text-ink/70">{booking.client.phone}</div>}
              {booking.location && (
                <div className="flex items-center gap-1 text-xs text-ink/70 mt-2">
                  <MapPin className="w-3 h-3" strokeWidth={2} />
                  {booking.location}
                </div>
              )}
            </CardBody>
          </Card>

          {partners.length > 0 && (
            <div className="mt-4">
              <AssignPartner
                bookingId={booking.id}
                partners={partners.map((p) => ({ id: p.id, name: p.user.name }))}
                assignedMembershipId={booking.assignedMembershipId}
              />
            </div>
          )}

          <div className="mt-4">
            <BookingActions bookingId={booking.id} status={booking.status} />
            {role !== "PARTNER" && !["CANCELED", "COMPLETED", "BALANCE_PAID", "FOLLOWED_UP"].includes(booking.status) && (
              <div className="mt-4 rounded-xl border border-border bg-white px-5 py-4"><RescheduleCancel bookingId={booking.id} canCancel canReschedule timezone={business.timezone} currentStartISO={booking.startAt.toISOString()} /></div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
