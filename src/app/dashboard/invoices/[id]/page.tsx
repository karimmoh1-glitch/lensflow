import { redirect, notFound } from "next/navigation";
import { requireBusiness, homeRouteFor, STAFF_ROLES } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Card, CardBody, Badge } from "@/components/ui";
import { formatMoney } from "@/lib/utils";
import { format } from "date-fns";

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireBusiness();
  if (!ctx) redirect("/login");
  if (!STAFF_ROLES.includes(ctx.role)) redirect(homeRouteFor(ctx.role, ctx.business));
  const { business } = ctx;
  const { id } = await params;

  const invoice = await prisma.invoice.findFirst({
    where: { id, businessId: business.id },
    include: { client: true, booking: { include: { service: true, payments: { where: { status: "PAID" } } } } },
  });
  if (!invoice) notFound();

  const paidCents = invoice.booking?.payments.reduce((s, p) => s + p.amountCents, 0) ?? 0;
  const remainingCents = Math.max(0, invoice.totalCents - paidCents);

  return (
    <div className="max-w-2xl mx-auto px-4 md:px-8 py-6 md:py-10">
      <Card>
        <CardBody className="p-8">
          <div className="flex items-start justify-between mb-8">
            <div>
              <h1 className="font-display text-2xl">{business.name}</h1>
              <p className="text-xs text-ink/45 mt-1">Invoice {invoice.number}</p>
            </div>
            <Badge tone={remainingCents === 0 ? "success" : invoice.status === "OVERDUE" ? "danger" : "warning"}>
              {remainingCents === 0 ? "paid" : invoice.status.toLowerCase()}
            </Badge>
          </div>

          <div className="grid grid-cols-2 gap-6 mb-8 text-sm">
            <div>
              <div className="text-xs text-ink/40 mb-1">Billed to</div>
              <div className="font-medium">{invoice.client.name}</div>
              {invoice.client.email && <div className="text-ink/50">{invoice.client.email}</div>}
            </div>
            <div className="text-right">
              <div className="text-xs text-ink/40 mb-1">Date</div>
              <div>{format(invoice.createdAt, "MMM d, yyyy")}</div>
              {invoice.dueDate && (
                <>
                  <div className="text-xs text-ink/40 mb-1 mt-2">Due</div>
                  <div>{format(invoice.dueDate, "MMM d, yyyy")}</div>
                </>
              )}
            </div>
          </div>

          {invoice.booking && (
            <div className="border-t border-b border-border py-3 mb-4 flex justify-between text-sm">
              <span>{invoice.booking.service.name}</span>
              <span>{formatMoney(invoice.subtotalCents)}</span>
            </div>
          )}

          <div className="space-y-1.5 text-sm">
            {invoice.discountCents > 0 && (
              <div className="flex justify-between text-ink/55">
                <span>Discount</span>
                <span>-{formatMoney(invoice.discountCents)}</span>
              </div>
            )}
            <div className="flex justify-between font-medium">
              <span>Total</span>
              <span>{formatMoney(invoice.totalCents)}</span>
            </div>
            <div className="flex justify-between text-success">
              <span>Paid</span>
              <span>{formatMoney(paidCents)}</span>
            </div>
            <div className="flex justify-between font-semibold pt-1.5 border-t border-border">
              <span>Balance due</span>
              <span className={remainingCents > 0 ? "text-warning" : ""}>{formatMoney(remainingCents)}</span>
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
