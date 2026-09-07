import { redirect } from "next/navigation";
import { requireBusiness } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHeader, Card, Badge, EmptyState } from "@/components/ui";
import { format, isToday } from "date-fns";
import { toZonedDisplayDate } from "@/lib/utils";

const STATUS_TONE: Record<string, "neutral" | "success" | "warning" | "info" | "danger"> = {
  INQUIRY: "neutral",
  BOOKED: "info",
  DEPOSIT_PAID: "warning",
  CONFIRMED: "success",
  QUESTIONNAIRE_COMPLETE: "success",
  UPCOMING: "success",
  COMPLETED: "neutral",
  BALANCE_PAID: "success",
  FOLLOWED_UP: "neutral",
  CANCELED: "danger",
};

export default async function PartnerHomePage() {
  const ctx = await requireBusiness();
  if (!ctx || ctx.role !== "PARTNER") redirect("/login");
  const { business, membership } = ctx;

  // Least privilege: a partner only ever sees bookings explicitly assigned to their
  // membership — never the full organization calendar.
  const bookings = await prisma.booking.findMany({
    where: { businessId: business.id, assignedMembershipId: membership.id, status: { not: "CANCELED" } },
    include: { client: true, service: true },
    orderBy: { startAt: "asc" },
  });

  const todayBookings = bookings.filter((b) => isToday(b.startAt));
  const upcoming = bookings.filter((b) => b.startAt > new Date() && !isToday(b.startAt));
  const past = bookings.filter((b) => b.startAt <= new Date() && !isToday(b.startAt));

  return (
    <div className="max-w-2xl mx-auto px-4 md:px-8 py-8 md:py-10">
      <PageHeader title="Your assigned work" description={`At ${business.name}`} />

      {bookings.length === 0 ? (
        <EmptyState title="Nothing assigned yet" description="Bookings assigned to you will show up here." />
      ) : (
        <>
          {todayBookings.length > 0 && (
            <div className="mb-8">
              <h2 className="text-sm font-medium text-ink mb-2.5">Today</h2>
              <BookingList bookings={todayBookings} timezone={business.timezone} />
            </div>
          )}
          <div className="mb-8">
            <h2 className="text-sm font-medium text-ink mb-2.5">Upcoming</h2>
            {upcoming.length === 0 ? (
              <EmptyState title="Nothing else upcoming" description="Bookings assigned to you further out will show up here." />
            ) : (
              <BookingList bookings={upcoming} timezone={business.timezone} />
            )}
          </div>
          {past.length > 0 && (
            <div>
              <h2 className="text-sm font-medium text-ink mb-2.5">Past</h2>
              <BookingList bookings={past} timezone={business.timezone} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function BookingList({
  bookings,
  timezone,
}: {
  bookings: { id: string; startAt: Date; status: string; location: string | null; service: { name: string }; client: { name: string } }[];
  timezone: string;
}) {
  return (
    <Card>
      <div className="divide-y divide-border">
        {bookings.map((b) => (
          <div key={b.id} className="flex items-center justify-between gap-3 px-4 py-3.5">
            <div className="min-w-0">
              <div className="text-sm font-medium truncate">
                {b.service.name} — {b.client.name}
              </div>
              <div className="text-xs text-ink/65">
                {format(toZonedDisplayDate(b.startAt, timezone), "EEE, MMM d 'at' h:mm a")}
                {b.location && ` · ${b.location}`}
              </div>
            </div>
            <Badge tone={STATUS_TONE[b.status] ?? "neutral"}>{b.status.replaceAll("_", " ").toLowerCase()}</Badge>
          </div>
        ))}
      </div>
    </Card>
  );
}
