import { redirect } from "next/navigation";
import Link from "next/link";
import { requireBusiness } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PageHeader, Button } from "@/components/ui";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { cn } from "@/lib/utils";

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const ctx = await requireBusiness();
  if (!ctx) redirect("/login");
  const { business } = ctx;
  const { month } = await searchParams;

  const anchor = month ? new Date(`${month}-01T00:00:00`) : new Date();
  const monthStart = startOfMonth(anchor);
  const monthEnd = endOfMonth(anchor);
  const gridStart = startOfWeek(monthStart);
  const gridEnd = endOfWeek(monthEnd);
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  const bookings = await prisma.booking.findMany({
    where: { businessId: business.id, startAt: { gte: gridStart, lte: gridEnd }, status: { not: "CANCELED" } },
    include: { client: true, service: true },
    orderBy: { startAt: "asc" },
  });

  const byDay = new Map<string, typeof bookings>();
  for (const b of bookings) {
    const key = format(b.startAt, "yyyy-MM-dd");
    byDay.set(key, [...(byDay.get(key) ?? []), b]);
  }

  const prevMonth = format(addMonths(anchor, -1), "yyyy-MM");
  const nextMonth = format(addMonths(anchor, 1), "yyyy-MM");

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-8 py-6 md:py-10">
      <PageHeader
        title={format(anchor, "MMMM yyyy")}
        action={
          <div className="flex items-center gap-1">
            <Link
              href={`?month=${prevMonth}`}
              aria-label="Previous month"
              className="inline-flex items-center justify-center w-8 h-8 rounded-md text-ink/45 hover:text-ink hover:bg-black/[0.05] transition-colors"
            >
              <ChevronLeft className="w-4 h-4" strokeWidth={2} />
            </Link>
            <Link href={`?month=${format(new Date(), "yyyy-MM")}`}>
              <Button variant="outline" size="sm">
                Today
              </Button>
            </Link>
            <Link
              href={`?month=${nextMonth}`}
              aria-label="Next month"
              className="inline-flex items-center justify-center w-8 h-8 rounded-md text-ink/45 hover:text-ink hover:bg-black/[0.05] transition-colors"
            >
              <ChevronRight className="w-4 h-4" strokeWidth={2} />
            </Link>
          </div>
        }
      />

      {/* Month grid — desktop/tablet */}
      <div className="hidden md:block">
        <div className="grid grid-cols-7 text-xs font-semibold text-ink/40 mb-2">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="px-2 py-1">
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1.5">
          {days.map((day) => {
            const key = format(day, "yyyy-MM-dd");
            const dayBookings = byDay.get(key) ?? [];
            const inMonth = isSameMonth(day, anchor);
            return (
              <div
                key={key}
                className={cn(
                  "min-h-28 rounded-lg border border-border p-2 bg-white",
                  !inMonth && "bg-black/[0.02] text-ink/30",
                  isToday(day) && "border-accent ring-1 ring-accent/30"
                )}
              >
                <div className={cn("text-xs font-medium mb-1", isToday(day) && "text-accent-text")}>{format(day, "d")}</div>
                <div className="space-y-1">
                  {dayBookings.slice(0, 3).map((b) => (
                    <Link
                      key={b.id}
                      href={`/dashboard/bookings/${b.id}`}
                      className="block truncate text-[11px] rounded bg-accent-soft text-accent-text px-1.5 py-0.5 hover:bg-accent/20"
                      title={`${format(b.startAt, "h:mm a")} ${b.service.name} — ${b.client.name}`}
                    >
                      {format(b.startAt, "h:mma")} {b.client.name}
                    </Link>
                  ))}
                  {dayBookings.length > 3 && <div className="text-[11px] text-ink/40">+{dayBookings.length - 3} more</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Agenda list — mobile: a 7-column grid isn't usable at phone width */}
      <div className="md:hidden divide-y divide-border border-t border-border">
        {days
          .filter((day) => isSameMonth(day, anchor) && (byDay.get(format(day, "yyyy-MM-dd"))?.length ?? 0) > 0)
          .map((day) => {
            const dayBookings = byDay.get(format(day, "yyyy-MM-dd")) ?? [];
            return (
              <div key={day.toISOString()} className="py-3">
                <div className={cn("text-xs font-medium mb-2", isToday(day) ? "text-accent-text" : "text-ink/45")}>
                  {format(day, "EEE, MMM d")}
                  {isToday(day) && " · Today"}
                </div>
                <div className="space-y-1.5">
                  {dayBookings.map((b) => (
                    <Link key={b.id} href={`/dashboard/bookings/${b.id}`} className="flex items-center justify-between text-sm">
                      <span>
                        {format(b.startAt, "h:mm a")} — {b.client.name}
                      </span>
                      <span className="text-ink/40 text-xs">{b.service.name}</span>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        {days.every((day) => (byDay.get(format(day, "yyyy-MM-dd"))?.length ?? 0) === 0) && (
          <p className="py-8 text-center text-sm text-ink/40">No bookings this month.</p>
        )}
      </div>
    </div>
  );
}
