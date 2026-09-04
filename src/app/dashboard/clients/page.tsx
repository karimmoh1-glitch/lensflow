import { redirect } from "next/navigation";
import Link from "next/link";
import { requireBusiness, homeRouteFor, STAFF_ROLES } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHeader, EmptyState, Card, Badge } from "@/components/ui";
import { formatMoney, initials } from "@/lib/utils";
import { InviteClientButton } from "./InviteClientButton";
import { PromotePartnerButton } from "./PromotePartnerButton";

export default async function ClientsPage() {
  const ctx = await requireBusiness();
  if (!ctx) redirect("/login");
  if (!STAFF_ROLES.includes(ctx.role)) redirect(homeRouteFor(ctx.role, ctx.business));
  const { business } = ctx;

  const [clients, clientMemberships] = await Promise.all([
    prisma.client.findMany({
      where: { businessId: business.id },
      include: { bookings: true, payments: { where: { status: "PAID" } }, subscriptions: { where: { status: "ACTIVE" } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.orgMembership.findMany({
      where: { businessId: business.id, role: "CLIENT" },
      select: { id: true, userId: true },
    }),
  ]);
  const clientMembershipByUserId = new Map(clientMemberships.map((m) => [m.userId, m.id]));
  const canPromote = ctx.role === "OWNER" || ctx.role === "ADMIN";

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-8 py-6 md:py-10">
      <PageHeader title="Clients" description={`${clients.filter((c) => c.relationship === "CUSTOMER").length} customers · ${clients.filter((c) => c.relationship === "LEAD").length} potential`} action={<InviteClientButton />} />

      {clients.length === 0 ? (
        <EmptyState
          title="No clients yet"
          description="Invite your first client to give them access to their bookings, payments, and files."
          action={<InviteClientButton />}
        />
      ) : (
        <Card>
          <div className="divide-y divide-border">
            {clients.map((c) => {
              const ltv = c.payments.reduce((s, p) => s + p.amountCents, 0);
              return (
                <Link
                  key={c.id}
                  href={`/dashboard/clients/${c.id}`}
                  className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 px-5 py-3.5 hover:bg-black/[0.02]"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-accent-soft text-accent-text flex items-center justify-center text-xs font-semibold shrink-0">
                      {initials(c.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{c.name}</div>
                      <div className="text-xs text-ink/65 truncate">{c.email ?? c.phone ?? "No contact info"}</div>
                    </div>
                  </div>
                  <div className="flex items-center flex-wrap gap-3 pl-11 sm:pl-0 shrink-0">
                    <Badge tone={c.relationship === "CUSTOMER" ? "success" : c.relationship === "CONTACT" ? "neutral" : "info"}>{c.relationship === "CUSTOMER" ? "Customer" : c.relationship === "CONTACT" ? "Contact" : "Potential"}</Badge>
                    {c.subscriptions.length > 0 && <Badge tone="success">Member</Badge>}
                    {c.userId ? <Badge tone="info">Portal active</Badge> : null}
                    <div className="text-right">
                      <div className="text-sm font-medium">{formatMoney(ltv)}</div>
                      <div className="text-xs text-ink/60">{c.bookings.length} booking{c.bookings.length !== 1 && "s"}</div>
                    </div>
                    {canPromote && c.userId && clientMembershipByUserId.has(c.userId) && (
                      <PromotePartnerButton membershipId={clientMembershipByUserId.get(c.userId)!} name={c.name} />
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
