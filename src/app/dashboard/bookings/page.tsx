import { redirect } from "next/navigation";
import Link from "next/link";
import { requireBusiness } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHeader, Badge, EmptyState, Card } from "@/components/ui";
import { formatMoney } from "@/lib/utils";
import { format } from "date-fns";

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

export default async function BookingsPage() {
  const ctx = await requireBusiness();
  if (!ctx) redirect("/login");
  const { business } = ctx;

  const bookings = await prisma.booking.findMany({
    where: { businessId: business.id },
    include: { client: true, service: true, payments: true },
    orderBy: { startAt: "desc" },
  });

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-8 py-6 md:py-10">
      <PageHeader title="All bookings" description={`${bookings.length} total`} />

      {bookings.length === 0 ? (
        <EmptyState title="No bookings yet" description="Bookings created from your inbox or public booking page will show up here." />
      ) : (
        <Card>
          <div className="divide-y divide-border">
            {bookings.map((b) => {
              const paidCents = b.payments.filter((p) => p.status === "PAID").reduce((s, p) => s + p.amountCents, 0);
              return (
                <Link key={b.id} href={`/dashboard/bookings/${b.id}`} className="flex items-center gap-3 px-5 py-4 hover:bg-black/[0.02]">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm font-medium truncate">{b.client.name}</span>
                      <Badge tone={STATUS_TONE[b.status] ?? "neutral"} className="sm:hidden">
                        {b.status.replaceAll("_", " ").toLowerCase()}
                      </Badge>
                    </div>
                    <div className="text-xs text-ink/45 truncate">
                      {b.service.name} · {format(b.startAt, "MMM d, yyyy · h:mm a")}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-medium">{formatMoney(b.totalCents)}</div>
                    <div className="text-xs text-ink/40">{formatMoney(paidCents)} paid</div>
                  </div>
                  <Badge tone={STATUS_TONE[b.status] ?? "neutral"} className="hidden sm:inline-flex">
                    {b.status.replaceAll("_", " ").toLowerCase()}
                  </Badge>
                </Link>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
