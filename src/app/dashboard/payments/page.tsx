import { redirect } from "next/navigation";
import Link from "next/link";
import { requireBusiness, homeRouteFor, STAFF_ROLES } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHeader, Badge, EmptyState, Card, CardBody } from "@/components/ui";
import { formatMoney } from "@/lib/utils";
import { format } from "date-fns";
import { ConfirmPaymentButton } from "./ConfirmPaymentButton";

export default async function PaymentsPage() {
  const ctx = await requireBusiness();
  if (!ctx) redirect("/login");
  if (!STAFF_ROLES.includes(ctx.role)) redirect(homeRouteFor(ctx.role, ctx.business));
  const { business } = ctx;

  const payments = await prisma.payment.findMany({
    where: { businessId: business.id },
    include: { client: true, booking: { include: { service: true } } },
    orderBy: { createdAt: "desc" },
  });

  const awaiting = payments.filter((p) => p.status === "AWAITING_CONFIRMATION");
  const collected = payments.filter((p) => p.status === "PAID").reduce((s, p) => s + p.amountCents, 0);
  const pendingCents = awaiting.reduce((s, p) => s + p.amountCents, 0);
  const failedCents = payments.filter((p) => p.status === "FAILED").reduce((s, p) => s + p.amountCents, 0);

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-8 py-6 md:py-10">
      <PageHeader title="All payments" />

      <div className="grid grid-cols-3 gap-3 mb-8">
        <Card>
          <CardBody>
            <div className="text-xs font-medium text-ink/60 mb-1">Collected</div>
            <div className="text-xl font-display text-success-text">{formatMoney(collected)}</div>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <div className="text-xs font-medium text-ink/60 mb-1">Pending</div>
            <div className="text-xl font-display text-warning-text">{formatMoney(pendingCents)}</div>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <div className="text-xs font-medium text-ink/60 mb-1">Failed</div>
            <div className="text-xl font-display text-danger-text">{formatMoney(failedCents)}</div>
          </CardBody>
        </Card>
      </div>

      {awaiting.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-medium text-ink mb-2.5">Awaiting confirmation</h2>
          <Card>
            <div className="divide-y divide-border">
              {awaiting.map((p) => (
                <div key={p.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-3.5">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">
                      {p.client.name} · {formatMoney(p.amountCents)}
                    </div>
                    <div className="text-xs text-ink/65 truncate">
                      {p.method.toLowerCase().replace("_", " ")} · {p.purpose.toLowerCase()}
                      {p.reference && ` · ref ${p.reference}`} · {format(p.createdAt, "MMM d")}
                    </div>
                  </div>
                  <ConfirmPaymentButton paymentId={p.id} />
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      <h2 className="text-sm font-medium text-ink mb-2.5">History</h2>
      {payments.length === 0 ? (
        <EmptyState title="No payments yet" description="Payments requested from bookings will show up here." />
      ) : (
        <Card>
          <div className="divide-y divide-border">
            {payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                <div className="min-w-0">
                  <Link href={p.bookingId ? `/dashboard/bookings/${p.bookingId}` : "#"} className="text-sm font-medium hover:underline block truncate">
                    {p.client.name} · {formatMoney(p.amountCents)}
                  </Link>
                  <div className="text-xs text-ink/65 truncate">
                    {p.booking?.service.name ?? "—"} · {p.method.toLowerCase().replace("_", " ")} · {format(p.createdAt, "MMM d, yyyy")}
                  </div>
                </div>
                <Badge tone={p.status === "PAID" ? "success" : p.status === "FAILED" ? "danger" : "warning"}>
                  {p.status.replaceAll("_", " ").toLowerCase()}
                </Badge>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
