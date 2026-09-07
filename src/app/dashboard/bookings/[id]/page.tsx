import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { requireBusiness } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { MapPin } from "lucide-react";
import { Badge, Card, CardBody, PageHeader } from "@/components/ui";
import { ConversationLink } from "./ConversationLink";
import { formatMoney, toZonedDisplayDate } from "@/lib/utils";
import { format } from "date-fns";
import { BookingActions } from "./BookingActions";
import { RescheduleCancel } from "./RescheduleCancel";
import { AssignPartner } from "./AssignPartner";
import { DeliveryPanel } from "./DeliveryPanel";

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
    include: { client: true, service: true, questionnaire: true },
  });
  if (!booking) notFound();

  // A partner can only ever see the bookings explicitly assigned to them — the same
  // least-privilege scoping /partner enforces in its list view, re-checked here since a
  // partner could otherwise reach any booking by guessing its URL.
  if (role === "PARTNER" && booking.assignedMembershipId !== membership.id) notFound();

  const partners = await prisma.orgMembership.findMany({
    where: { businessId: business.id, role: "PARTNER" },
    include: { user: true },
  });

  const currentIndex = LIFECYCLE.findIndex((s) => s.status === booking.status);

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-8 py-6 md:py-10">
      <PageHeader
        title={`${booking.client.name} — ${booking.service.name}`}
        description={format(toZonedDisplayDate(booking.startAt, business.timezone), "EEEE, MMMM d, yyyy · h:mm a")}
      />

      {booking.status !== "CANCELED" && (
        <div className="flex items-center mb-8 overflow-x-auto scrollbar-thin pb-2">
          {LIFECYCLE.map((step, i) => (
            <div key={step.status} className="flex items-center shrink-0">
              <div
                className={`text-xs font-medium px-3 py-1.5 rounded-full whitespace-nowrap ${
                  i <= currentIndex ? "bg-ink text-white" : "bg-black/5 text-ink/60"
                }`}
              >
                {step.label}
              </div>
              {i < LIFECYCLE.length - 1 && <div className={`w-6 h-px ${i < currentIndex ? "bg-ink" : "bg-black/10"}`} />}
            </div>
          ))}
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardBody>
              <div className="text-xs font-semibold uppercase tracking-wide text-ink/60 mb-3">Details</div>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between"><dt className="text-ink/75">Service</dt><dd className="font-medium">{booking.service.name}</dd></div>
                <div className="flex justify-between"><dt className="text-ink/75">When</dt><dd className="font-medium">{format(toZonedDisplayDate(booking.startAt, business.timezone), "EEE, MMM d · h:mm a")} – {format(toZonedDisplayDate(booking.endAt, business.timezone), "h:mm a")}</dd></div>
                {booking.location && <div className="flex justify-between"><dt className="text-ink/75">Where</dt><dd className="font-medium">{booking.location}</dd></div>}
                <div className="flex justify-between"><dt className="text-ink/75">Price</dt><dd className="font-medium">{formatMoney(booking.totalCents)}</dd></div>
                {booking.externalCalendarProvider && <div className="flex justify-between"><dt className="text-ink/75">On your calendar</dt><dd className="font-medium">{booking.externalCalendarProvider === "GOOGLE_CALENDAR" ? "Google Calendar" : "Apple Calendar"}</dd></div>}
              </dl>
              <div className="mt-4 pt-4 border-t border-border"><ConversationLink bookingId={booking.id} conversationId={booking.conversationId} clientId={booking.clientId} /></div>
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <div className="text-xs font-semibold uppercase tracking-wide text-ink/60 mb-3">Questionnaire</div>
              {booking.questionnaire?.completedAt ? (
                <Badge tone="success">Completed</Badge>
              ) : booking.questionnaire?.sentAt ? (
                <Badge tone="warning">Sent — awaiting response</Badge>
              ) : (
                <Badge tone="neutral">Not sent</Badge>
              )}
            </CardBody>
          </Card>

          {(["COMPLETED", "BALANCE_PAID", "FOLLOWED_UP"].includes(booking.status) || booking.deliveryUrl) && (
            <DeliveryPanel bookingId={booking.id} deliveryUrl={booking.deliveryUrl} deliveryNote={booking.deliveryNote} deliveredAt={booking.deliveredAt} />
          )}
        </div>

        <div>
          <Card>
            <CardBody>
              <div className="text-xs font-semibold uppercase tracking-wide text-ink/60 mb-3">Client</div>
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
            <BookingActions bookingId={booking.id} status={booking.status} hasQuestionnaire={Boolean(booking.questionnaire)} />
            {role !== "PARTNER" && !["CANCELED", "COMPLETED", "BALANCE_PAID", "FOLLOWED_UP"].includes(booking.status) && (
              <div className="mt-4 rounded-2xl border border-border bg-white px-5 py-4"><RescheduleCancel bookingId={booking.id} canCancel canReschedule timezone={business.timezone} currentStartISO={booking.startAt.toISOString()} /></div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
