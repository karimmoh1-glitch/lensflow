import { redirect } from "next/navigation";
import Link from "next/link";
import { CHANNEL_META } from "@/lib/channelIcons";
import { requireBusiness, homeRouteFor, STAFF_ROLES } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isAcknowledgement, splitMessage } from "@/lib/cleanMessage";
import { PageHeader, EmptyState, Badge } from "@/components/ui";
import { initials } from "@/lib/utils";
import { InviteClientButton } from "./InviteClientButton";
import { NewClientButton } from "./NewClientButton";
import { PromotePartnerButton } from "./PromotePartnerButton";
import { readOpportunity } from "@/lib/opportunity";

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const ctx = await requireBusiness();
  if (!ctx) redirect("/login");
  if (!STAFF_ROLES.includes(ctx.role)) redirect(homeRouteFor(ctx.role, ctx.business));
  const { business } = ctx;
  const sp = await searchParams;
  const bookingUrl = `${(process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "")}/book/${business.handle}`;

  const [clients, clientMemberships] = await Promise.all([
    prisma.client.findMany({
      where: { businessId: business.id },
      include: {
        bookings: true,
        subscriptions: { where: { status: "ACTIVE" } },
        // The latest conversation that is a real person's, with what they asked and where it stands.
        conversations: { where: { category: "PRIORITY", archived: false }, orderBy: { lastMessageAt: "desc" }, take: 1, select: { channel: true, lastMessageAt: true, messages: { orderBy: { createdAt: "desc" }, take: 1, select: { direction: true, createdAt: true, body: true } } } },
        leads: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true, intent: true, respondedAt: true, lastInboundAt: true, followUpAt: true, createdAt: true, requestedDateText: true, requestedLocation: true, budgetCents: true, estimatedValueCents: true, service: { select: { name: true } } } },
      },
      orderBy: { updatedAt: "desc" },
      // The most recent 600 people keep the page fast at volume; search reaches everyone from the inbox.
      take: 600,
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
      lastWordIsTheirs: last?.direction === "INBOUND" && !isAcknowledgement(splitMessage(last.body).text),
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
      <PageHeader
        title="People"
        description={`${listed.filter((r) => r.c.relationship === "CUSTOMER").length} customers · ${listed.filter((r) => r.c.relationship !== "CUSTOMER").length} potential`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <InviteClientButton />
            <NewClientButton bookingUrl={bookingUrl} autoOpen={sp.new === "1"} />
          </div>
        }
      />

      {listed.length === 0 ? (
        <EmptyState
          title="Nobody yet"
          description="Everyone who writes to you on a connected channel shows up here. Until then, add your first client yourself or send them your booking link."
          action={<NewClientButton bookingUrl={bookingUrl} />}
        />
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <div aria-hidden className="hidden md:grid grid-cols-[minmax(0,1fr)_120px_110px_150px] gap-4 px-5 h-9 items-center border-b border-border bg-paper text-xs text-ink/65">
            <span>Name</span>
            <span>Relationship</span>
            <span>Bookings</span>
            <span>Last conversation</span>
          </div>
          <ul className="divide-y divide-border">
            {listed.map(({ c, opportunity }) => {
              const bookings = c.bookings.filter((b) => b.status !== "CANCELED").length;
              return (
                // The whole row opens the person (a stretched link), and the partner action sits
                // above it rather than inside it — a button nested in a link is not operable.
                <li
                  key={c.id}
                  className="relative grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1fr)_120px_100px_200px] items-center gap-x-4 gap-y-1 px-4 md:px-5 py-3 hover:bg-paper focus-within:bg-paper"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div aria-hidden className="w-8 h-8 rounded-full bg-ink/[0.07] text-ink/75 flex items-center justify-center text-2xs font-semibold shrink-0">
                      {initials(c.name)}
                    </div>
                    <div className="min-w-0">
                      <Link href={`/dashboard/clients/${c.id}`} className="block text-sm font-medium text-ink truncate after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ink/70">{c.name}</Link>
                      <div className="text-xs text-ink/65 truncate">{opportunity.rank > 0 ? <><span className="text-ink/80">{opportunity.label}</span> · {opportunity.reason}</> : (c.email ?? c.phone ?? (c.instagram ? `@${c.instagram}` : "No contact info"))}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap justify-end md:justify-start">
                    <Badge tone={c.relationship === "CUSTOMER" ? "success" : "neutral"}>{c.relationship === "CUSTOMER" ? "Customer" : c.relationship === "CONTACT" ? "Contact" : "Potential"}</Badge>
                    {c.subscriptions.length > 0 && <Badge>Member</Badge>}
                    {c.userId ? <Badge>Portal</Badge> : null}
                    {canPromote && c.userId && clientMembershipByUserId.has(c.userId) && (
                      <span className="md:hidden relative z-10"><PromotePartnerButton membershipId={clientMembershipByUserId.get(c.userId)!} name={c.name} /></span>
                    )}
                  </div>
                  <div className="hidden md:block text-13 text-ink tabular-nums">{bookings} {bookings === 1 ? "booking" : "bookings"}</div>
                  <div className="hidden md:flex items-center justify-between gap-2 min-w-0">
                    <span className="text-13 text-ink/65 truncate">{c.conversations[0] ? CHANNEL_META[c.conversations[0].channel].label : "None yet"}</span>
                    {canPromote && c.userId && clientMembershipByUserId.has(c.userId) && (
                      <span className="relative z-10 shrink-0"><PromotePartnerButton membershipId={clientMembershipByUserId.get(c.userId)!} name={c.name} /></span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {unlisted > 0 && <p className="mt-3 text-xs text-ink/65">{unlisted} {unlisted === 1 ? "contact" : "contacts"} without a conversation or booking {unlisted === 1 ? "is" : "are"} kept but not listed here.</p>}
    </div>
  );
}
