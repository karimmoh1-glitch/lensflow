import { redirect } from "next/navigation";
import Link from "next/link";
import { requireBusiness, homeRouteFor, STAFF_ROLES } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { scoreLead, scoreLabel } from "@/lib/leadScoring";
import { EmptyState } from "@/components/ui";
import { formatMoney, cn, initials } from "@/lib/utils";
import { formatDistanceToNowStrict, subDays } from "date-fns";
import { ThreadPanel } from "./ThreadPanel";
import { ChannelBadge, CHANNEL_META } from "@/lib/channelIcons";
import { AutoGmailSync } from "./AutoGmailSync";

type Filter = "all" | "needs_reply" | "cold";

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ c?: string; filter?: string }> }) {
  const ctx = await requireBusiness();
  if (!ctx) redirect("/login");
  if (!STAFF_ROLES.includes(ctx.role)) redirect(homeRouteFor(ctx.role, ctx.business));
  const { business } = ctx;
  const { c: selectedId, filter: filterParam } = await searchParams;
  const filter: Filter = filterParam === "needs_reply" || filterParam === "cold" ? filterParam : "all";

  const [conversations, gmailIntegration] = await Promise.all([
    prisma.conversation.findMany({
      where: { businessId: business.id, archived: false },
      include: {
        client: true,
        lead: { include: { service: true } },
        messages: { orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: { lastMessageAt: "desc" },
    }),
    prisma.integration.findUnique({ where: { businessId_provider: { businessId: business.id, provider: "EMAIL" } } }),
  ]);
  const gmailConnected = Boolean(gmailIntegration?.refreshToken);

  const coldCutoff = subDays(new Date(), 3);
  const rows = conversations
    .map((conv) => {
      const lead = conv.lead;
      const score = lead
        ? scoreLead({
            intent: lead.intent,
            hasRequestedDate: Boolean(lead.requestedDate || lead.requestedDateText),
            requestedDate: lead.requestedDate,
            serviceValueCents: lead.service?.priceCents ?? lead.estimatedValueCents,
            hoursSinceLastInbound: lead.lastInboundAt ? (Date.now() - lead.lastInboundAt.getTime()) / 3_600_000 : 999,
            hasRespondedYet: Boolean(lead.respondedAt),
            fieldsKnownCount: [lead.extractedName, lead.serviceId, lead.requestedDate, lead.requestedLocation, lead.budgetCents].filter(
              Boolean
            ).length,
          }).score
        : null;
      const needsReply = Boolean(lead && !lead.respondedAt);
      const isCold = Boolean(lead && lead.status !== "BOOKED" && lead.status !== "LOST" && lead.createdAt <= coldCutoff);
      return { conv, lead, score, needsReply, isCold };
    })
    .filter((r) => {
      if (filter === "needs_reply") return r.needsReply;
      if (filter === "cold") return r.isCold;
      return true;
    })
    // Priority order: whatever needs a reply comes first (that's the actual work),
    // hottest leads first within that, then everything else by how recently it moved —
    // so opening the inbox always shows what actually needs attention at the top,
    // not just whatever happened to arrive most recently.
    .sort((a, b) => {
      if (a.needsReply !== b.needsReply) return a.needsReply ? -1 : 1;
      const scoreDiff = (b.score ?? -1) - (a.score ?? -1);
      if (scoreDiff !== 0) return scoreDiff;
      return b.conv.lastMessageAt.getTime() - a.conv.lastMessageAt.getTime();
    });

  const needsReplyCount = conversations.filter((c) => c.lead && !c.lead.respondedAt).length;
  const coldCount = conversations.filter(
    (c) => c.lead && c.lead.status !== "BOOKED" && c.lead.status !== "LOST" && c.lead.createdAt <= coldCutoff
  ).length;

  const active = selectedId ? conversations.find((c) => c.id === selectedId) : undefined;

  return (
    <div className="flex h-screen">
      {gmailConnected && <AutoGmailSync />}
      <div className={cn("w-full md:w-[340px] shrink-0 border-r border-border flex-col bg-white", selectedId ? "hidden md:flex" : "flex")}>
        <div className="px-5 pt-4 pb-3 border-b border-border">
          <h1 className="font-display text-section-title text-ink mb-3">Inbox</h1>
          <div className="flex items-center gap-1 text-xs">
            <FilterChip href="/dashboard/inbox" active={filter === "all"} label="All" count={conversations.length} />
            <FilterChip href="/dashboard/inbox?filter=needs_reply" active={filter === "needs_reply"} label="Needs reply" count={needsReplyCount} />
            <FilterChip href="/dashboard/inbox?filter=cold" active={filter === "cold"} label="Going cold" count={coldCount} />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {rows.length === 0 && (
            <div className="p-6">
              <EmptyState
                title={filter === "all" ? "No conversations yet" : "Nothing here"}
                description={
                  filter === "all"
                    ? "Inquiries from every connected channel will show up here."
                    : filter === "needs_reply"
                      ? "Every lead has been responded to."
                      : "No leads have gone quiet."
                }
              />
            </div>
          )}
          {rows.map(({ conv, lead, score }) => {
            const isActive = active?.id === conv.id;
            const temp = score !== null ? scoreLabel(score) : null;
            return (
              <Link
                key={conv.id}
                href={`/dashboard/inbox?c=${conv.id}`}
                className={cn("block px-5 py-3.5 border-b border-border hover:bg-black/[0.02]", isActive && "bg-accent-soft/50")}
              >
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-7 h-7 rounded-full bg-black/[0.05] flex items-center justify-center text-[10px] font-semibold shrink-0">
                    {initials(conv.client?.name ?? conv.externalHandle ?? "?")}
                  </div>
                  <span className="text-sm font-medium truncate flex-1">{conv.client?.name ?? conv.externalHandle ?? "Unknown"}</span>
                  {score !== null && (
                    <span
                      className={cn(
                        "flex items-center gap-1 text-xs font-medium shrink-0",
                        temp === "HOT" ? "text-accent-text" : temp === "WARM" ? "text-warning-text" : "text-ink/35"
                      )}
                    >
                      <span
                        className={cn(
                          "w-1.5 h-1.5 rounded-full",
                          temp === "HOT" ? "bg-accent" : temp === "WARM" ? "bg-warning" : "bg-ink/25"
                        )}
                      />
                      {score}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 text-xs text-ink/40 mb-1">
                  <ChannelBadge channel={conv.channel} />
                  <span>{CHANNEL_META[conv.channel].label}</span>
                  <span>·</span>
                  <span>{formatDistanceToNowStrict(conv.lastMessageAt, { addSuffix: true })}</span>
                </div>
                <p className="text-xs text-ink/55 line-clamp-2">{conv.messages[0]?.body}</p>
                {lead?.estimatedValueCents ? (
                  <div className="text-xs text-ink/40 mt-1">{formatMoney(lead.estimatedValueCents)} potential</div>
                ) : null}
              </Link>
            );
          })}
        </div>
      </div>

      <div className={cn("flex-1 min-w-0", !selectedId && "hidden md:flex")}>
        {active ? (
          <ThreadPanel conversationId={active.id} />
        ) : (
          <div className="hidden md:flex flex-1 items-center justify-center text-ink/40 text-sm">Select a conversation</div>
        )}
      </div>
    </div>
  );
}

function FilterChip({ href, active, label, count }: { href: string; active: boolean; label: string; count: number }) {
  return (
    <Link
      href={href}
      className={cn(
        "px-2.5 py-1 rounded-full font-medium transition-colors",
        active ? "bg-ink text-white" : "text-ink/50 hover:bg-black/[0.05]"
      )}
    >
      {label}
      {count > 0 && <span className={cn("ml-1", active ? "text-white/60" : "text-ink/35")}>{count}</span>}
    </Link>
  );
}
