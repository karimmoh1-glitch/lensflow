import { redirect } from "next/navigation";
import Link from "next/link";
import { requireBusiness, homeRouteFor, STAFF_ROLES } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHeader, EmptyState, Card, Badge } from "@/components/ui";
import { initials } from "@/lib/utils";
import { InviteClientButton } from "./InviteClientButton";
import { PromotePartnerButton } from "./PromotePartnerButton";
import { readOpportunity } from "@/lib/opportunity";
import { cn } from "@/lib/utils";

export default async function ClientsPage() {
  const ctx = await requireBusiness();
  if (!ctx) redirect("/login");
  if (!STAFF_ROLES.includes(ctx.role)) redirect(homeRouteFor(ctx.role, ctx.business));
  const { business } = ctx;

  const [clients, clientMemberships] = await Promise.all([
    prisma.client.findMany({
      where: { businessId: business.id },
      include: {
        bookings: true,
        subscriptions: { where: { status: "ACTIVE" } },
        // The latest conversation that is a real person's, with what they asked and where it stands.
        conversations: { where: { category: "PRIORITY", archived: false }, orderBy: { lastMessageAt: "desc" }, take: 1, select: { channel: true, lastMessageAt: true, messages: { orderBy: { createdAt: "desc" }, take: 1, select: { direction: true, createdAt: true } } } },
        leads: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true, intent: true, respondedAt: true, lastInboundAt: true, followUpAt: true, createdAt: true, requestedDateText: true, requestedLocation: true, budgetCents: true, estimatedValueCents: true, service: { select: { name: true } } } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.orgMembership.findMany({
      where: { businessId: business.id, role: "CLIENT" },
      select: { id: true, userId: true },
    }),
  ]);
  const clientMembershipByUserId = new Map(clientMemberships.map((m) => [m.userId, m.id]));
  const now = new Date();
  // Someone belongs here when there is evidence: a person's conversation, a booking, or a
  // customer relationship. Everyone else is counted, not listed — no junk rows from mail
  // that was never a person's.
  const read = clients.map((c) => {
    const conv = c.conversations[0];
    const last = conv?.messages[0];
    const upcoming = c.bookings.find((b) => b.startAt >= now && b.status !== "CANCELED");
    const lead = c.leads[0];
    const opportunity = readOpportunity({
      category: conv ? "PRIORITY" : c.relationship === "CUSTOMER" || c.bookings.length > 0 ? "PRIORITY" : null,
      relationship: c.relationship,
      lead: lead ? { status: lead.status, intent: lead.intent, respondedAt: lead.respondedAt, lastInboundAt: lead.lastInboundAt, followUpAt: lead.followUpAt, createdAt: lead.createdAt, serviceName: lead.service?.name ?? null, requestedDateText: lead.requestedDateText, requestedLocation: lead.requestedLocation, budgetCents: lead.budgetCents, estimatedValueCents: lead.estimatedValueCents } : null,
      lastWordIsTheirs: last?.direction === "INBOUND",
      lastInboundAt: last?.direction === "INBOUND" ? last.createdAt : null,
      hasUpcomingBooking: Boolean(upcoming),
      upcomingUnconfirmed: upcoming ? upcoming.status === "BOOKED" : false,
      now,
    });
    return { c, opportunity, evidence: Boolean(conv) || c.bookings.length > 0 || c.relationship === "CUSTOMER" };
  });
  const listed = read.filter((r) => r.evidence).sort((a, b) => b.opportunity.rank - a.opportunity.rank || (b.c.conversations[0]?.lastMessageAt.getTime() ?? 0) - (a.c.conversations[0]?.lastMessageAt.getTime() ?? 0));
  const unlisted = read.length - listed.length;
  const canPromote = ctx.role === "OWNER" || ctx.role === "ADMIN";

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-8 py-6 md:py-10">
      <PageHeader title="People" description={`${clients.filter((c) => c.relationship === "CUSTOMER").length} customers · ${clients.filter((c) => c.relationship === "LEAD").length} potential`} action={<InviteClientButton />} />

      {listed.length === 0 ? (
        <EmptyState
          title="Nobody yet"
          description="Everyone who writes to you on a connected channel shows up here, with their conversations and bookings."
          action={<InviteClientButton />}
        />
      ) : (
        <Card>
          <div className="divide-y divide-border">
            {listed.map(({ c, opportunity }) => {
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
                      <div className="text-xs text-ink/70 truncate">{opportunity.rank > 0 ? <><span className={cn("font-semibold", opportunity.kind === "client" ? "text-success-text" : "text-accent-text")}>{opportunity.label}</span> · {opportunity.reason}</> : (c.email ?? c.phone ?? (c.instagram ? `@${c.instagram}` : "No contact info"))}</div>
                    </div>
                  </div>
                  <div className="flex items-center flex-wrap gap-3 pl-11 sm:pl-0 shrink-0">
                    <Badge tone={c.relationship === "CUSTOMER" ? "success" : c.relationship === "CONTACT" ? "neutral" : "info"}>{c.relationship === "CUSTOMER" ? "Customer" : c.relationship === "CONTACT" ? "Contact" : "Potential"}</Badge>
                    {c.subscriptions.length > 0 && <Badge tone="success">Member</Badge>}
                    {c.userId ? <Badge tone="info">Portal active</Badge> : null}
                    <div className="text-right">
                      <div className="text-sm font-medium">{c.bookings.filter((b) => b.status !== "CANCELED").length} booking{c.bookings.filter((b) => b.status !== "CANCELED").length !== 1 && "s"}</div>
                      <div className="text-xs text-ink/65">{c.conversations[0] ? `Last on ${c.conversations[0].channel.toLowerCase()}` : "No conversation yet"}</div>
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
      {unlisted > 0 && <p className="mt-3 text-xs text-ink/65">{unlisted} {unlisted === 1 ? "contact" : "contacts"} without a conversation or booking {unlisted === 1 ? "is" : "are"} kept but not listed here.</p>}
    </div>
  );
}
