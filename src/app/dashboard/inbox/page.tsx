import { redirect } from "next/navigation";
import Link from "next/link";
import { requireBusiness, homeRouteFor, STAFF_ROLES } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { EmptyState } from "@/components/ui";
import { cn, firstName } from "@/lib/utils";
import { ConversationRow } from "@/components/inbox/ConversationRow";
import { formatDistanceToNowStrict } from "date-fns";
import type { ChannelType, ConversationCategory, Prisma } from "@prisma/client";
import { ThreadPanel } from "./ThreadPanel";
import { ChannelBadge, CHANNEL_META } from "@/lib/channelIcons";
import { AutoGmailSync } from "./AutoGmailSync";
import { ConversationTools } from "./ConversationTools";
import { SearchBox } from "./SearchBox";
import { previewOf } from "@/lib/cleanMessage";

/**
 * The inbox. One list of every conversation from every connected channel, newest first,
 * with the ones waiting on you lifted to the top. Two views over the same stream:
 *
 *   PRIORITY (default) — people. Automated mail, newsletters and platform notices are not
 *     here — not deleted, just not here.
 *   ALL — everything, with what it is: Automated, Promotions, Vendors, Internal, Spam.
 *
 * Search, channel and state filters live in the URL, so any view can be reloaded or
 * shared. Classification is metadata set at ingestion (lib/classifyMessage.ts); this page
 * never mutates it.
 */
type View = "priority" | "all";
type Filter = "all" | "unread" | "unanswered";
type Cat = "all" | "automated" | "promotions" | "vendors" | "internal" | "spam";
type ChannelFilter = "all" | ChannelType;

const CHANNELS: ChannelType[] = ["EMAIL", "INSTAGRAM", "WHATSAPP", "SMS", "WEBSITE"];
const CAT_TO_CATEGORY: Record<Exclude<Cat, "all">, ConversationCategory> = { automated: "AUTOMATED", promotions: "PROMOTIONAL", vendors: "VENDOR", internal: "INTERNAL", spam: "SPAM" };
const CATEGORY_LABEL: Record<ConversationCategory, string> = { PRIORITY: "Priority", AUTOMATED: "Automated", PROMOTIONAL: "Promotion", VENDOR: "Vendor", INTERNAL: "Internal", SPAM: "Spam" };

type Params = { c?: string; q?: string; filter?: string; view?: string; cat?: string; channel?: string; summarize?: string };

export default async function InboxPage({ searchParams }: { searchParams: Promise<Params> }) {
  const ctx = await requireBusiness();
  if (!ctx) redirect("/login");
  if (!STAFF_ROLES.includes(ctx.role)) redirect(homeRouteFor(ctx.role, ctx.business));
  const { business } = ctx;
  const sp = await searchParams;
  const selectedId = sp.c;
  const q = (sp.q ?? "").trim().slice(0, 120);
  const view: View = sp.view === "all" ? "all" : "priority";
  const filter: Filter = sp.filter === "unread" || sp.filter === "unanswered" ? sp.filter : "all";
  const cat: Cat = (["automated", "promotions", "vendors", "internal", "spam"] as Cat[]).includes(sp.cat as Cat) ? (sp.cat as Cat) : "all";
  const channel: ChannelFilter = CHANNELS.includes(sp.channel as ChannelType) ? (sp.channel as ChannelType) : "all";

  const contains = q ? { contains: q, mode: "insensitive" as const } : null;
  const where: Prisma.ConversationWhereInput = {
    businessId: business.id,
    archived: false,
    ...(contains ? { OR: [{ subject: contains }, { externalHandle: contains }, { client: { name: contains } }, { client: { email: contains } }, { messages: { some: { body: contains } } }] } : {}),
  };

  const [conversations, gmailIntegration] = await Promise.all([
    prisma.conversation.findMany({
      where,
      include: {
        client: { select: { id: true, name: true } },
        assignee: { select: { user: { select: { name: true } } } },
        lead: { select: { extractedName: true, requestedDateText: true } },
        messages: { orderBy: { createdAt: "desc" }, take: 1, select: { body: true, direction: true, createdAt: true } },
      },
      orderBy: { lastMessageAt: "desc" },
      // The list is a view, not an archive: the most recent 400 keeps it fast at volume;
      // search reaches everything.
      take: 400,
    }),
    prisma.integration.findUnique({ where: { businessId_provider: { businessId: business.id, provider: "EMAIL" } }, select: { refreshToken: true } }),
  ]);
  const gmailConnected = Boolean(gmailIntegration?.refreshToken);

  const enriched = conversations.map((conv) => {
    const last = conv.messages[0];
    const isPerson = conv.category === "PRIORITY";
    const unread = Boolean(last && last.direction === "INBOUND" && (!conv.lastReadAt || conv.lastReadAt < last.createdAt));
    // Waiting on you: the last word in the thread is theirs.
    const unanswered = isPerson && last?.direction === "INBOUND";
    return { conv, last, isPerson, unread, unanswered };
  });

  const inView = enriched.filter((r) => (view === "priority" ? r.isPerson : cat === "all" ? true : r.conv.category === CAT_TO_CATEGORY[cat]));
  const byChannel = inView.filter((r) => channel === "all" || r.conv.channel === channel);
  const rows = byChannel
    .filter((r) => (filter === "unread" ? r.unread : filter === "unanswered" ? r.unanswered : true))
    .sort((a, b) => {
      if (view === "priority" && filter === "all" && a.unanswered !== b.unanswered) return a.unanswered ? -1 : 1;
      return b.conv.lastMessageAt.getTime() - a.conv.lastMessageAt.getTime();
    });

  const people = enriched.filter((r) => r.isPerson);
  const waiting = people.filter((r) => r.unanswered);
  const unreadCount = byChannel.filter((r) => r.unread).length;
  const unansweredCount = byChannel.filter((r) => r.unanswered).length;
  const channelCounts = Object.fromEntries(CHANNELS.map((c) => [c, inView.filter((r) => r.conv.channel === c).length])) as Record<ChannelType, number>;
  const catCounts: Record<Cat, number> = {
    all: enriched.length,
    automated: enriched.filter((r) => r.conv.category === "AUTOMATED").length,
    promotions: enriched.filter((r) => r.conv.category === "PROMOTIONAL").length,
    vendors: enriched.filter((r) => r.conv.category === "VENDOR").length,
    internal: enriched.filter((r) => r.conv.category === "INTERNAL").length,
    spam: enriched.filter((r) => r.conv.category === "SPAM").length,
  };
  const filteredOut = enriched.length - people.length;

  const active = selectedId ? conversations.find((c) => c.id === selectedId) : undefined;
  const href = (o: Partial<{ view: View; filter: Filter; cat: Cat; channel: ChannelFilter; q: string }>) => buildInboxHref({ view, filter, cat, channel, q, ...o });
  const rowHref = (id: string) => {
    const base = href({});
    return base.includes("?") ? `${base}&c=${id}` : `/dashboard/inbox?c=${id}`;
  };

  const headline =
    q ? `${rows.length} result${rows.length === 1 ? "" : "s"} for “${q}”`
    : view === "all" ? `${enriched.length} conversation${enriched.length === 1 ? "" : "s"}`
    : waiting.length === 0 ? "Nobody is waiting on you."
    : `${waiting.length === 1 ? "1 person is" : `${waiting.length} people are`} waiting on you`;

  return (
    <div className="flex h-[100dvh] md:h-screen bg-white">
      {gmailConnected && <AutoGmailSync />}
      {/* Below lg the list and the thread take turns (a tablet is a wide phone here); from lg they sit side by side. */}
      <div className={cn("w-full lg:w-[380px] xl:w-[400px] shrink-0 border-r border-border flex-col bg-white", selectedId ? "hidden lg:flex" : "flex")}>
        <div className="px-4 md:px-5 pt-3 md:pt-4 pb-3 border-b border-border space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h1 className="font-sans font-extrabold text-[19px] tracking-[-0.02em] text-ink">Inbox</h1>
            <div role="tablist" aria-label="Inbox view" className="inline-flex items-center rounded-full bg-black/[0.05] p-0.5 text-xs font-semibold">
              <Link role="tab" aria-selected={view === "priority"} href={href({ view: "priority", cat: "all" })} className={cn("px-3 py-1 rounded-full transition-all", view === "priority" ? "bg-white text-ink shadow-xs" : "text-ink/65 hover:text-ink")}>
                Priority
              </Link>
              <Link role="tab" aria-selected={view === "all"} href={href({ view: "all", filter: "all" })} className={cn("px-3 py-1 rounded-full transition-all", view === "all" ? "bg-white text-ink shadow-xs" : "text-ink/65 hover:text-ink")}>
                All
              </Link>
            </div>
          </div>

          <SearchBox initial={q} />

          <p className="text-sm text-ink" aria-live="polite">
            {q || view === "all" ? <span className="font-extrabold">{headline}</span> : waiting.length === 0 ? <span className="text-ink/60">{headline}</span> : (
              <>
                <span className="font-extrabold">{headline}</span>
                <span className="text-ink/65"> · {waiting.slice(0, 3).map((r) => firstName(nameOf(r.conv))).join(", ")}{waiting.length > 3 ? "…" : ""}</span>
              </>
            )}
            {view === "priority" && filteredOut > 0 && !q && (
              <span className="block text-[11px] text-ink/60 mt-0.5">{filteredOut} automated or promotional {filteredOut === 1 ? "message" : "messages"} kept out of the way · <Link href={href({ view: "all", cat: "all" })} className="underline decoration-ink/20 hover:text-ink">see all</Link></span>
            )}
          </p>

          <div className="-mx-4 md:-mx-5 px-4 md:px-5 flex items-center gap-1 text-xs overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label="Filter by channel">
            <Chip href={href({ channel: "all" })} active={channel === "all"} label="All channels" />
            {CHANNELS.filter((c) => channelCounts[c] > 0 || channel === c).map((c) => (
              <Chip key={c} href={href({ channel: c })} active={channel === c} label={CHANNEL_META[c].label} count={channelCounts[c]} icon={<ChannelBadge channel={c} className="w-3.5 h-3.5" />} />
            ))}
          </div>

          {view === "priority" ? (
            <div className="flex items-center gap-1 text-xs" role="group" aria-label="Filter by state">
              <Chip href={href({ filter: "all" })} active={filter === "all"} label="Everyone" count={byChannel.length} />
              <Chip href={href({ filter: "unanswered" })} active={filter === "unanswered"} label="Waiting on you" count={unansweredCount} tone="accent" />
              <Chip href={href({ filter: "unread" })} active={filter === "unread"} label="Unread" count={unreadCount} />
            </div>
          ) : (
            <div className="-mx-4 md:-mx-5 px-4 md:px-5 flex items-center gap-1 text-xs overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label="Filter by kind">
              {(["all", "automated", "promotions", "vendors", "internal", "spam"] as Cat[]).map((c) => (
                <Chip key={c} href={href({ cat: c })} active={cat === c} label={c === "all" ? "Everything" : c.charAt(0).toUpperCase() + c.slice(1)} count={catCounts[c]} />
              ))}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin overscroll-contain">
          {rows.length === 0 && (
            <div className="p-6">
              <EmptyState
                title={q ? "Nothing matches." : view === "all" ? "Nothing in this pile." : filter === "unanswered" ? "Nobody is waiting on you." : filter === "unread" ? "You're all caught up." : channel !== "all" ? `Nothing from ${CHANNEL_META[channel].label} yet.` : "Your inbox is quiet."}
                description={
                  q ? "Try a name, an email address, or a word from the message."
                  : view === "all" ? "Mail Daythread classifies this way will collect here — kept, never in your way."
                  : filter !== "all" ? "New messages land here the moment they arrive."
                  : channel !== "all" ? "Messages on that channel appear here as soon as someone writes."
                  : "Connect a channel under Settings and every message from it lands here — with who they are and what they need."
                }
                tone={view === "priority" && filter !== "all" && !q ? "success" : "neutral"}
                action={view === "priority" && filter === "all" && channel === "all" && !q && enriched.length === 0 ? <Link href="/dashboard/settings?tab=channels" className="inline-flex items-center h-9 px-4 rounded-full bg-ink text-white text-sm font-semibold">Connect a channel</Link> : undefined}
              />
            </div>
          )}

          <ol className="dt-rows" aria-label="Conversations">
            {rows.map(({ conv, last, isPerson, unread, unanswered }) => (
              <ConversationRow
                key={conv.id}
                href={rowHref(conv.id)}
                active={active?.id === conv.id}
                name={nameOf(conv)}
                channel={conv.channel}
                time={shortAgo(conv.lastMessageAt)}
                timeISO={conv.lastMessageAt.toISOString()}
                preview={previewOf(last?.body ?? "")}
                fromYou={last?.direction === "OUTBOUND"}
                unread={unread}
                waiting={unanswered}
                isPerson={isPerson}
                categoryLabel={CATEGORY_LABEL[conv.category]}
                subject={conv.subject}
                assigneeName={conv.assignee?.user.name ?? null}
                tools={<ConversationTools conversationId={conv.id} unread={unread} category={conv.category} />}
              />
            ))}
          </ol>
        </div>
      </div>

      <div className={cn("flex-1 min-w-0 min-h-0", selectedId ? "flex" : "hidden lg:flex")}>
        {active ? (
          <ThreadPanel conversationId={active.id} autoSummarize={sp.summarize === "1"} backHref={href({})} />
        ) : (
          <div className="hidden lg:flex flex-1 items-center justify-center px-10">
            <div className="max-w-xs text-center">
              <div aria-hidden className="flex flex-col items-center mb-4">
                <span className="w-px h-6 bg-ink/10" />
                <span className="w-[11px] h-[11px] rounded-full bg-signal ring-[3px] ring-paper" />
                <span className="w-px h-6 bg-gradient-to-b from-ink/10 to-transparent" />
              </div>
              <p className="text-sm font-semibold text-ink">Pick a conversation</p>
              <p className="mt-1 text-sm text-ink/65 leading-relaxed">Who they are, what they mentioned and your history with them shows up beside it.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function nameOf(conv: { client: { name: string } | null; lead: { extractedName: string | null } | null; externalHandle: string | null }): string {
  return conv.client?.name ?? conv.lead?.extractedName ?? conv.externalHandle ?? "Unknown";
}

function shortAgo(d: Date): string {
  const s = formatDistanceToNowStrict(d);
  return s.replace(/ seconds?/, "s").replace(/ minutes?/, "m").replace(/ hours?/, "h").replace(/ days?/, "d").replace(/ months?/, "mo").replace(/ years?/, "y");
}

function buildInboxHref(o: { view: View; filter: Filter; cat: Cat; channel: ChannelFilter; q: string }): string {
  const params = new URLSearchParams();
  if (o.q) params.set("q", o.q);
  if (o.view !== "priority") params.set("view", o.view);
  if (o.view === "priority" && o.filter !== "all") params.set("filter", o.filter);
  if (o.view === "all" && o.cat !== "all") params.set("cat", o.cat);
  if (o.channel !== "all") params.set("channel", o.channel);
  const qs = params.toString();
  return qs ? `/dashboard/inbox?${qs}` : "/dashboard/inbox";
}

function Chip({ href, active, label, count, icon, tone }: { href: string; active: boolean; label: string; count?: number; icon?: React.ReactNode; tone?: "accent" }) {
  return (
    <Link href={href} aria-current={active ? "page" : undefined} className={cn("inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full font-medium whitespace-nowrap transition-all duration-150 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50", active ? "bg-ink text-white" : tone === "accent" && count ? "text-accent-text hover:bg-accent-soft" : "text-ink/70 hover:bg-black/[0.05]")}>
      {icon}
      {label}
      {typeof count === "number" && count > 0 && <span className={cn("tabular-nums", active ? "text-white/60" : "text-ink/60")}>{count}</span>}
    </Link>
  );
}
