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
import { DeleteConversationButton } from "./DeleteConversationButton";

type Filter = "all" | "needs_reply" | "cold";
type Sort = "priority" | "newest" | "oldest";

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ c?: string; filter?: string; sort?: string }> }) {
  const ctx = await requireBusiness();
  if (!ctx) redirect("/login");
  if (!STAFF_ROLES.includes(ctx.role)) redirect(homeRouteFor(ctx.role, ctx.business));
  const { business } = ctx;
  const { c: selectedId, filter: filterParam, sort: sortParam } = await searchParams;
  const filter: Filter = filterParam === "needs_reply" || filterParam === "cold" ? filterParam : "all";
  const sort: Sort = sortParam === "newest" || sortParam === "oldest" ? sortParam : "priority";

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
    .sort((a, b) => {
      if (sort === "newest") return b.conv.lastMessageAt.getTime() - a.conv.lastMessageAt.getTime();
      if (sort === "oldest") return a.conv.lastMessageAt.getTime() - b.conv.lastMessageAt.getTime();
      // Priority (default): whatever needs a reply comes first (that's the actual
      // work), hottest lead first within that — using the same scoreLead() signals
      // (intent, urgency of the requested date, deal value, response staleness) that
      // already drive "Going cold," not a second competing ranking — then everything
      // else by how recently it moved, so the order is always explainable from what's
      // already shown on the row (the score badge + "Needs reply").
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
          <div className="flex items-center gap-1 text-xs mb-2">
            <FilterChip href={buildInboxHref(undefined, sort)} active={filter === "all"} label="All" count={conversations.length} />
            <FilterChip
              href={buildInboxHref("needs_reply", sort)}
              active={filter === "needs_reply"}
              label="Needs reply"
              count={needsReplyCount}
            />
            <FilterChip href={buildInboxHref("cold", sort)} active={filter === "cold"} label="Going cold" count={coldCount} />
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-ink/60">
            <span className="font-medium">Sort by</span>
            <SortChip href={buildInboxHref(filter, "priority")} active={sort === "priority"} label="Priority" />
            <SortChip href={buildInboxHref(filter, "newest")} active={sort === "newest"} label="Newest" />
            <SortChip href={buildInboxHref(filter, "oldest")} active={sort === "oldest"} label="Oldest" />
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
          {rows.map(({ conv, lead, score, needsReply }) => {
            const isActive = active?.id === conv.id;
            const temp = score !== null ? scoreLabel(score) : null;
            const metaBits = [
              needsReply && "Needs reply",
              lead?.estimatedValueCents ? formatMoney(lead.estimatedValueCents) : null,
              lead?.requestedDateText ? `Requested ${lead.requestedDateText}` : null,
            ].filter(Boolean) as string[];
            return (
              <Link
                key={conv.id}
                href={`/dashboard/inbox?c=${conv.id}`}
                className={cn("group block px-5 py-3.5 border-b border-border hover:bg-black/[0.02]", isActive && "bg-accent-soft/50")}
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
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                    <DeleteConversationButton conversationId={conv.id} />
                  </div>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-ink/60 mb-1">
                  <ChannelBadge channel={conv.channel} />
                  <span>{CHANNEL_META[conv.channel].label}</span>
                  <span>·</span>
                  <span>{formatDistanceToNowStrict(conv.lastMessageAt, { addSuffix: true })}</span>
                </div>
                <p className="text-xs text-ink/75 line-clamp-2">{conv.messages[0]?.body}</p>
                {metaBits.length > 0 && (
                  <div className="flex items-center gap-1 text-xs mt-1">
                    {metaBits.map((bit, i) => (
                      <span key={bit} className={cn(i === 0 && needsReply ? "text-accent-text font-medium" : "text-ink/60")}>
                        {i > 0 && <span className="text-ink/25 mr-1">•</span>}
                        {bit}
                      </span>
                    ))}
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      </div>

      <div className={cn("flex-1 min-w-0", !selectedId && "hidden md:flex")}>
        {active ? (
          <ThreadPanel conversationId={active.id} />
        ) : (
          <div className="hidden md:flex flex-1 items-center justify-center px-10">
            <div className="max-w-xs text-center">
              <div aria-hidden className="flex flex-col items-center mb-4">
                <span className="w-px h-6 bg-ink/10" />
                <span className="w-[11px] h-[11px] rounded-full bg-signal ring-[3px] ring-paper" />
                <span className="w-px h-6 bg-gradient-to-b from-ink/10 to-transparent" />
              </div>
              <p className="text-sm font-semibold text-ink">Pick a conversation</p>
              <p className="mt-1 text-sm text-ink/55 leading-relaxed">Who they are, what they&rsquo;ve booked and what to do next shows up beside it.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function buildInboxHref(filter: Filter | undefined, sort: Sort): string {
  const params = new URLSearchParams();
  if (filter && filter !== "all") params.set("filter", filter);
  if (sort !== "priority") params.set("sort", sort);
  const qs = params.toString();
  return qs ? `/dashboard/inbox?${qs}` : "/dashboard/inbox";
}

function SortChip({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link href={href} className={cn("px-2 py-0.5 rounded-full transition-colors", active ? "bg-ink/10 text-ink font-medium" : "hover:text-ink/60")}>
      {label}
    </Link>
  );
}

function FilterChip({ href, active, label, count }: { href: string; active: boolean; label: string; count: number }) {
  return (
    <Link
      href={href}
      className={cn(
        "px-2.5 py-1 rounded-full font-medium transition-colors",
        active ? "bg-ink text-white" : "text-ink/70 hover:bg-black/[0.05]"
      )}
    >
      {label}
      {count > 0 && <span className={cn("ml-1", active ? "text-white/60" : "text-ink/35")}>{count}</span>}
    </Link>
  );
}
