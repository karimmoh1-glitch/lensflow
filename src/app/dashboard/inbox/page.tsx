import { redirect } from "next/navigation";
import Link from "next/link";
import { requireBusiness, homeRouteFor, STAFF_ROLES } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { scoreLead, scoreLabel } from "@/lib/leadScoring";
import { EmptyState } from "@/components/ui";
import { formatMoney, cn, initials } from "@/lib/utils";
import { formatDistanceToNowStrict, subDays, startOfDay, endOfDay } from "date-fns";
import type { ConversationCategory } from "@prisma/client";
import { ThreadPanel } from "./ThreadPanel";
import { ChannelBadge, CHANNEL_META } from "@/lib/channelIcons";
import { AutoGmailSync } from "./AutoGmailSync";
import { ConversationTools } from "./ConversationTools";
import { previewOf } from "@/lib/cleanMessage";

/**
 * Two views over one stream.
 *
 *   PRIORITY (default) — only conversations with a person on the other end, ranked into
 *     NEEDS YOU (they're waiting on a reply), TODAY (something is happening today), and
 *     WATCH (real conversations that don't need you right now). The header says how many
 *     things need you, by name. Automated mail, newsletters and platform notices are not
 *     here — not deleted, just not here.
 *
 *   ALL — everything, with what it is: Customers, Automated, Promotions, Internal, Spam.
 *
 * Classification is metadata on the conversation (lib/classifyMessage.ts at ingestion);
 * this page never mutates it. Priority is a view; All is the source of truth.
 */
type View = "priority" | "all";
type Filter = "all" | "needs_reply" | "cold";
type Cat = "all" | "customers" | "leads" | "automated" | "promotions" | "vendors" | "internal" | "spam";
type Sort = "priority" | "newest" | "oldest";

const CAT_TO_CATEGORY: Record<Exclude<Cat, "all" | "customers" | "leads">, ConversationCategory> = { automated: "AUTOMATED", promotions: "PROMOTIONAL", vendors: "VENDOR", internal: "INTERNAL", spam: "SPAM" };
const CATEGORY_LABEL: Record<ConversationCategory, string> = { PRIORITY: "Priority", AUTOMATED: "Automated", PROMOTIONAL: "Promotion", VENDOR: "Vendor", INTERNAL: "Internal", SPAM: "Spam" };

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ c?: string; filter?: string; sort?: string; view?: string; cat?: string; summarize?: string }> }) {
  const ctx = await requireBusiness();
  if (!ctx) redirect("/login");
  if (!STAFF_ROLES.includes(ctx.role)) redirect(homeRouteFor(ctx.role, ctx.business));
  const { business } = ctx;
  const sp = await searchParams;
  const selectedId = sp.c;
  const view: View = sp.view === "all" ? "all" : "priority";
  const filter: Filter = sp.filter === "needs_reply" || sp.filter === "cold" ? sp.filter : "all";
  const cat: Cat = (["customers", "leads", "automated", "promotions", "vendors", "internal", "spam"] as Cat[]).includes(sp.cat as Cat) ? (sp.cat as Cat) : "all";
  const sort: Sort = sp.sort === "newest" || sp.sort === "oldest" ? sp.sort : "priority";
  const now = new Date();

  const [conversations, gmailIntegration] = await Promise.all([
    prisma.conversation.findMany({
      where: { businessId: business.id, archived: false },
      include: {
        client: { select: { id: true, name: true, relationship: true } },
        lead: { include: { service: { select: { priceCents: true } } } },
        messages: { orderBy: { createdAt: "desc" }, take: 1, select: { body: true, direction: true, createdAt: true } },
        bookings: { where: { startAt: { gte: startOfDay(now), lte: endOfDay(now) }, status: { not: "CANCELED" } }, select: { id: true } },
      },
      orderBy: { lastMessageAt: "desc" },
      // The list is a view, not an archive: the most recent 400 keeps it fast at volume;
      // ⌘K search reaches everything.
      take: 400,
    }),
    prisma.integration.findUnique({ where: { businessId_provider: { businessId: business.id, provider: "EMAIL" } } }),
  ]);
  const gmailConnected = Boolean(gmailIntegration?.refreshToken);

  const coldCutoff = subDays(now, 3);
  const enriched = conversations.map((conv) => {
    const lead = conv.lead;
    const score = lead
      ? scoreLead({
          intent: lead.intent,
          hasRequestedDate: Boolean(lead.requestedDate || lead.requestedDateText),
          requestedDate: lead.requestedDate,
          serviceValueCents: lead.service?.priceCents ?? lead.estimatedValueCents,
          hoursSinceLastInbound: lead.lastInboundAt ? (Date.now() - lead.lastInboundAt.getTime()) / 3_600_000 : 999,
          hasRespondedYet: Boolean(lead.respondedAt),
          fieldsKnownCount: [lead.extractedName, lead.serviceId, lead.requestedDate, lead.requestedLocation, lead.budgetCents].filter(Boolean).length,
        }).score
      : null;
    const needsReply = Boolean(lead && !lead.respondedAt && lead.status !== "BOOKED" && lead.status !== "LOST");
    const isCold = Boolean(lead && lead.status !== "BOOKED" && lead.status !== "LOST" && lead.createdAt <= coldCutoff);
    const isPerson = conv.category === "PRIORITY";
    const last = conv.messages[0];
    const unread = Boolean(last && last.direction === "INBOUND" && (!conv.lastReadAt || conv.lastReadAt < last.createdAt));
    const today = conv.bookings.length > 0;
    const group: "needs_you" | "today" | "watch" = needsReply ? "needs_you" : today ? "today" : "watch";
    return { conv, lead, score, needsReply, isCold, isPerson, today, group, unread };
  });

  const bySort = (a: (typeof enriched)[number], b: (typeof enriched)[number]) => {
    if (sort === "newest") return b.conv.lastMessageAt.getTime() - a.conv.lastMessageAt.getTime();
    if (sort === "oldest") return a.conv.lastMessageAt.getTime() - b.conv.lastMessageAt.getTime();
    if (a.needsReply !== b.needsReply) return a.needsReply ? -1 : 1;
    const scoreDiff = (b.score ?? -1) - (a.score ?? -1);
    if (scoreDiff !== 0) return scoreDiff;
    return b.conv.lastMessageAt.getTime() - a.conv.lastMessageAt.getTime();
  };

  const people = enriched.filter((r) => r.isPerson);
  const priorityRows = people
    .filter((r) => (filter === "needs_reply" ? r.needsReply : filter === "cold" ? r.isCold : true))
    .sort(bySort);
  const allRows = enriched
    .filter((r) => {
      if (cat === "all") return true;
      if (cat === "customers") return r.conv.client?.relationship === "CUSTOMER";
      if (cat === "leads") return r.isPerson && r.conv.client?.relationship === "LEAD";
      return r.conv.category === CAT_TO_CATEGORY[cat];
    })
    .sort(bySort);
  const rows = view === "priority" ? priorityRows : allRows;

  const needsYou = people.filter((r) => r.needsReply);
  const needsReplyCount = needsYou.length;
  const coldCount = people.filter((r) => r.isCold).length;
  const counts: Record<Cat, number> = {
    all: enriched.length,
    customers: enriched.filter((r) => r.conv.client?.relationship === "CUSTOMER").length,
    leads: enriched.filter((r) => r.isPerson && r.conv.client?.relationship === "LEAD").length,
    automated: enriched.filter((r) => r.conv.category === "AUTOMATED").length,
    promotions: enriched.filter((r) => r.conv.category === "PROMOTIONAL").length,
    vendors: enriched.filter((r) => r.conv.category === "VENDOR").length,
    internal: enriched.filter((r) => r.conv.category === "INTERNAL").length,
    spam: enriched.filter((r) => r.conv.category === "SPAM").length,
  };
  const filteredOut = enriched.length - people.length;

  const active = selectedId ? conversations.find((c) => c.id === selectedId) : undefined;
  const href = (o: Partial<{ view: View; filter: Filter; cat: Cat; sort: Sort }>) => buildInboxHref({ view, filter, cat, sort, ...o });

  // Group headings for the priority view, in order — only shown when the list isn't filtered.
  const grouped = view === "priority" && filter === "all" && sort === "priority";
  const order: Array<"needs_you" | "today" | "watch"> = ["needs_you", "today", "watch"];
  const GROUP_LABEL = { needs_you: "Needs you", today: "Today", watch: "Watch" } as const;
  const GROUP_TONE = { needs_you: "text-accent-text", today: "text-ink/60", watch: "text-ink/45" } as const;

  return (
    <div className="flex h-screen">
      {gmailConnected && <AutoGmailSync />}
      <div className={cn("w-full md:w-[360px] shrink-0 border-r border-border flex-col bg-white", selectedId ? "hidden md:flex" : "flex")}>
        <div className="px-5 pt-4 pb-3 border-b border-border">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h1 className="font-sans font-extrabold text-[17px] tracking-tight text-ink">Inbox</h1>
            <div role="tablist" aria-label="Inbox view" className="inline-flex items-center rounded-full bg-black/[0.05] p-0.5 text-xs font-semibold">
              <Link role="tab" aria-selected={view === "priority"} href={href({ view: "priority" })} className={cn("px-3 py-1 rounded-full transition-all", view === "priority" ? "bg-white text-ink shadow-xs" : "text-ink/55 hover:text-ink")}>
                Priority
              </Link>
              <Link role="tab" aria-selected={view === "all"} href={href({ view: "all", filter: "all" })} className={cn("px-3 py-1 rounded-full transition-all", view === "all" ? "bg-white text-ink shadow-xs" : "text-ink/55 hover:text-ink")}>
                All
              </Link>
            </div>
          </div>

          {view === "priority" ? (
            <>
              <p className="text-sm text-ink mb-2.5">
                {needsReplyCount === 0 ? (
                  <span className="text-ink/60">Nobody is waiting on you.</span>
                ) : (
                  <>
                    <span className="font-extrabold">{needsReplyCount === 1 ? "1 thing needs you" : `${needsReplyCount} things need you`}</span>
                    <span className="text-ink/55"> · {needsYou.slice(0, 3).map((r) => (r.conv.client?.name ?? r.lead?.extractedName ?? "Someone").split(" ")[0]).join(", ")}{needsReplyCount > 3 ? "…" : ""}</span>
                  </>
                )}
              </p>
              <div className="flex items-center gap-1 text-xs mb-2">
                <FilterChip href={href({ filter: "all" })} active={filter === "all"} label="Everyone" count={people.length} />
                <FilterChip href={href({ filter: "needs_reply" })} active={filter === "needs_reply"} label="Needs reply" count={needsReplyCount} />
                <FilterChip href={href({ filter: "cold" })} active={filter === "cold"} label="Going cold" count={coldCount} />
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-ink mb-2.5">
                <span className="font-extrabold">{enriched.length} conversation{enriched.length === 1 ? "" : "s"}</span>
                {filteredOut > 0 && (
                  <span className="text-ink/55">
                    {" "}· {filteredOut} kept out of Priority
                    <span className="text-ink/40">{[counts.automated && `${counts.automated} automated`, counts.promotions && `${counts.promotions} promotional`, counts.vendors && `${counts.vendors} vendor`, counts.internal && `${counts.internal} internal`, counts.spam && `${counts.spam} spam`].filter(Boolean).length ? ` (${[counts.automated && `${counts.automated} automated`, counts.promotions && `${counts.promotions} promotional`, counts.vendors && `${counts.vendors} vendor`, counts.internal && `${counts.internal} internal`, counts.spam && `${counts.spam} spam`].filter(Boolean).join(" · ")})` : ""}</span>
                  </span>
                )}
              </p>
            <div className="flex flex-wrap items-center gap-1 text-xs mb-2">
              {(["all", "customers", "leads", "automated", "promotions", "vendors", "internal", "spam"] as Cat[]).map((c) => (
                <FilterChip key={c} href={href({ cat: c })} active={cat === c} label={c === "all" ? "Everything" : c.charAt(0).toUpperCase() + c.slice(1)} count={counts[c]} />
              ))}
            </div>
            </>
          )}
          <div className="flex items-center gap-1.5 text-[11px] text-ink/60">
            <span className="font-medium">Sort by</span>
            <SortChip href={href({ sort: "priority" })} active={sort === "priority"} label="Priority" />
            <SortChip href={href({ sort: "newest" })} active={sort === "newest"} label="Newest" />
            <SortChip href={href({ sort: "oldest" })} active={sort === "oldest"} label="Oldest" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {rows.length === 0 && (
            <div className="p-6">
              <EmptyState
                title={view === "all" ? "Nothing in this pile." : filter === "all" ? "Your inbox is quiet." : filter === "needs_reply" ? "Nobody is waiting on you." : "No lead is going cold."}
                description={
                  view === "all"
                    ? "Mail Daythread classifies this way will collect here — kept, never in your way."
                    : filter === "all"
                      ? "When someone messages you on any connected channel, they appear here — with who they are, what they want, and what to do next."
                      : filter === "needs_reply"
                        ? "Every conversation has a reply. New ones land here the moment they arrive."
                        : "Daythread watches for leads that stop answering and lifts them here before they're gone."
                }
                tone={view === "priority" && filter !== "all" ? "success" : "neutral"}
              />
            </div>
          )}

          {(grouped ? order : ["flat" as const]).map((g) => {
            const list = g === "flat" ? rows : rows.filter((r) => r.group === g);
            if (list.length === 0) return null;
            return (
              <div key={g}>
                {g !== "flat" && (
                  <div className={cn("px-5 pt-3 pb-1 text-[10px] font-bold uppercase tracking-[0.14em]", GROUP_TONE[g])}>
                    {GROUP_LABEL[g]} <span className="text-ink/30">{list.length}</span>
                  </div>
                )}
                {list.map(({ conv, lead, score, needsReply, isPerson, unread }) => {
                  const isActive = active?.id === conv.id;
                  const temp = score !== null ? scoreLabel(score) : null;
                  const name = conv.client?.name ?? lead?.extractedName ?? conv.externalHandle ?? "Unknown";
                  const relationship = conv.client?.relationship;
                  const metaBits = [
                    needsReply && "Needs reply",
                    lead?.estimatedValueCents ? formatMoney(lead.estimatedValueCents) : null,
                    lead?.requestedDateText ? `Requested ${lead.requestedDateText}` : null,
                  ].filter(Boolean) as string[];
                  return (
                    <Link
                      key={conv.id}
                      href={href({}).includes("?") ? `${href({})}&c=${conv.id}` : `/dashboard/inbox?c=${conv.id}`}
                      className={cn("group relative block px-5 py-3.5 border-b border-border transition-colors hover:bg-black/[0.02] focus-visible:outline-none focus-visible:bg-black/[0.03] focus-within:bg-black/[0.02]", isActive && "bg-accent-soft/50", !isPerson && "bg-paper/40")}
                    >
                      {/* hover / focus action rail */}
                      <div className="absolute right-3 top-2.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-150">
                        <ConversationTools conversationId={conv.id} unread={unread} category={conv.category} clientId={conv.client?.id ?? null} relationship={conv.client?.relationship ?? null} />
                      </div>
                      <div className="flex items-center gap-2 mb-1 group-hover:pr-32 group-focus-within:pr-32">
                        <div className={cn("relative w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0", isPerson ? "bg-accent-soft text-accent-text" : "bg-black/[0.05] text-ink/50")}>
                          {initials(name)}
                          {(needsReply || unread) && <span aria-hidden className={cn("absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full ring-2 ring-white", needsReply ? "bg-accent" : "bg-signal")} />}
                        </div>
                        <span className={cn("text-sm truncate flex-1", isPerson ? (unread ? "font-extrabold text-ink" : "font-semibold text-ink") : unread ? "font-semibold text-ink/80" : "font-medium text-ink/70")}>{name}</span>
                        {isPerson && relationship && (
                          <span className={cn("text-[10px] font-bold rounded-full px-1.5 py-0.5 shrink-0", relationship === "CUSTOMER" ? "bg-success-soft text-success-text" : relationship === "CONTACT" ? "bg-black/[0.05] text-ink/60" : "bg-signal-soft text-signal-text")}>
                            {relationship === "CUSTOMER" ? "Customer" : relationship === "CONTACT" ? "Contact" : "Potential"}
                          </span>
                        )}
                        {!isPerson && <span className="text-[10px] font-bold rounded-full px-1.5 py-0.5 shrink-0 bg-black/[0.05] text-ink/55">{CATEGORY_LABEL[conv.category]}</span>}
                        {score !== null && (
                          <span className={cn("flex items-center gap-1 text-xs font-medium shrink-0", temp === "HOT" ? "text-accent-text" : temp === "WARM" ? "text-warning-text" : "text-ink/35")}>
                            <span className={cn("w-1.5 h-1.5 rounded-full", temp === "HOT" ? "bg-accent" : temp === "WARM" ? "bg-warning" : "bg-ink/25")} />
                            {score}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-ink/60 mb-1">
                        <ChannelBadge channel={conv.channel} />
                        <span>{CHANNEL_META[conv.channel].label}</span>
                        <span>·</span>
                        <span>{formatDistanceToNowStrict(conv.lastMessageAt, { addSuffix: true })}</span>
                      </div>
                      {conv.subject && !isPerson && <p className="text-xs font-medium text-ink/75 truncate">{conv.subject}</p>}
                      <p className={cn("text-xs line-clamp-2", isPerson ? (unread ? "text-ink/85" : "text-ink/70") : "text-ink/55")}>
                        {conv.messages[0]?.direction === "OUTBOUND" && <span className="text-ink/45">You: </span>}
                        {previewOf(conv.messages[0]?.body ?? "")}
                      </p>
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
                      {!isPerson && conv.categoryReason && <p className="mt-1 text-[11px] text-ink/45">{conv.categoryReason}</p>}
                    </Link>
                  );
                })}
              </div>
            );
          })}

          {view === "priority" && filteredOut > 0 && rows.length > 0 && (
            <Link href={href({ view: "all", cat: "all" })} className="block px-5 py-4 text-xs text-ink/50 hover:text-ink transition-colors">
              <span className="inline-flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-signal" />Daythread kept {filteredOut} automated, promotional or platform {filteredOut === 1 ? "message" : "messages"} out of your way →</span>
            </Link>
          )}
        </div>
      </div>

      <div className={cn("flex-1 min-w-0", !selectedId && "hidden md:flex")}>
        {active ? (
          <ThreadPanel conversationId={active.id} autoSummarize={sp.summarize === "1"} />
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

function buildInboxHref(o: { view: View; filter: Filter; cat: Cat; sort: Sort }): string {
  const params = new URLSearchParams();
  if (o.view !== "priority") params.set("view", o.view);
  if (o.view === "priority" && o.filter !== "all") params.set("filter", o.filter);
  if (o.view === "all" && o.cat !== "all") params.set("cat", o.cat);
  if (o.sort !== "priority") params.set("sort", o.sort);
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
    <Link href={href} className={cn("px-2.5 py-1 rounded-full font-medium transition-all duration-150", active ? "bg-ink text-white" : "text-ink/70 hover:bg-black/[0.05]")}>
      {label}
      {count > 0 && <span className={cn("ml-1", active ? "text-white/60" : "text-ink/35")}>{count}</span>}
    </Link>
  );
}
