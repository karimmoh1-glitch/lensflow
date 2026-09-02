import { redirect } from "next/navigation";
import Link from "next/link";
import { requireBusiness } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHeader, EmptyState, Card, Badge } from "@/components/ui";
import { cn, initials } from "@/lib/utils";
import { format, formatDistanceToNowStrict } from "date-fns";
import { ChannelBadge, CHANNEL_META } from "@/lib/channelIcons";

export default async function PartnerInboxPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const ctx = await requireBusiness();
  if (!ctx || ctx.role !== "PARTNER") redirect("/login");
  const { business, membership } = ctx;
  const { c: selectedId } = await searchParams;

  // Least privilege by default: a partner sees conversations tied to clients from their
  // assigned bookings only, unless the owner has explicitly granted full inbox access.
  let clientFilter: { clientId: { in: string[] } } | {} = {};
  if (!membership.canViewAllConversations) {
    const assignedBookings = await prisma.booking.findMany({
      where: { businessId: business.id, assignedMembershipId: membership.id },
      select: { clientId: true },
    });
    const clientIds = [...new Set(assignedBookings.map((b) => b.clientId))];
    clientFilter = { clientId: { in: clientIds } };
  }

  const conversations = await prisma.conversation.findMany({
    where: { businessId: business.id, archived: false, ...clientFilter },
    include: { client: true, messages: { orderBy: { createdAt: "desc" }, take: 1 } },
    orderBy: { lastMessageAt: "desc" },
  });

  const active = selectedId
    ? await prisma.conversation.findFirst({
        where: { id: selectedId, businessId: business.id, ...clientFilter },
        include: { client: true, messages: { orderBy: { createdAt: "asc" } } },
      })
    : null;

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      <div className={cn("w-full md:w-[340px] shrink-0 border-r border-border flex-col bg-white", selectedId ? "hidden md:flex" : "flex")}>
        <div className="px-5 pt-4 pb-3 border-b border-border">
          <h1 className="font-display text-lg text-ink">Conversations</h1>
          <p className="text-xs text-ink/40 mt-0.5">
            {membership.canViewAllConversations ? "All business conversations" : "Conversations with your assigned clients"}
          </p>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {conversations.length === 0 && (
            <div className="p-6">
              <EmptyState
                title="No conversations yet"
                description="Conversations with clients you're assigned to will show up here."
              />
            </div>
          )}
          {conversations.map((conv) => {
            const isActive = active?.id === conv.id;
            return (
              <Link
                key={conv.id}
                href={`/partner/inbox?c=${conv.id}`}
                className={cn("block px-5 py-3.5 border-b border-border hover:bg-black/[0.02]", isActive && "bg-accent-soft/50")}
              >
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-7 h-7 rounded-full bg-black/[0.05] flex items-center justify-center text-[10px] font-semibold shrink-0">
                    {initials(conv.client?.name ?? conv.externalHandle ?? "?")}
                  </div>
                  <span className="text-sm font-medium truncate flex-1">{conv.client?.name ?? conv.externalHandle ?? "Unknown"}</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-ink/40 mb-1">
                  <ChannelBadge channel={conv.channel} />
                  <span>{CHANNEL_META[conv.channel].label}</span>
                  <span>·</span>
                  <span>{formatDistanceToNowStrict(conv.lastMessageAt, { addSuffix: true })}</span>
                </div>
                <p className="text-xs text-ink/55 line-clamp-2">{conv.messages[0]?.body}</p>
              </Link>
            );
          })}
        </div>
      </div>

      <div className={cn("flex-1 min-w-0", !selectedId && "hidden md:flex")}>
        {active ? (
          <div className="flex-1 flex flex-col min-w-0">
            <div className="px-4 md:px-6 py-3.5 border-b border-border bg-white flex items-center gap-3">
              <Link href="/partner/inbox" className="md:hidden text-xs text-ink/45">
                ← Back
              </Link>
              <div className="flex-1 min-w-0">
                <h2 className="font-medium text-sm truncate">{active.client?.name ?? active.externalHandle ?? "Unknown"}</h2>
                <div className="flex items-center gap-1.5 text-xs text-ink/45">
                  <ChannelBadge channel={active.channel} />
                  {CHANNEL_META[active.channel].label}
                </div>
              </div>
              <Badge tone="neutral">View only</Badge>
            </div>
            <div className="flex-1 overflow-y-auto scrollbar-thin px-4 md:px-6 py-6 space-y-4">
              {active.messages.map((m) => (
                <div key={m.id} className={cn("max-w-md", m.direction === "OUTBOUND" ? "ml-auto" : "")}>
                  <div
                    className={cn(
                      "rounded-2xl px-4 py-2.5 text-sm",
                      m.direction === "OUTBOUND" ? "bg-ink text-white rounded-br-sm" : "bg-black/[0.05] text-ink rounded-bl-sm"
                    )}
                  >
                    {m.body}
                  </div>
                  <div className={cn("text-[11px] text-ink/35 mt-1", m.direction === "OUTBOUND" ? "text-right" : "")}>
                    {format(m.createdAt, "MMM d, h:mm a")}
                  </div>
                </div>
              ))}
            </div>
            <div className="px-4 md:px-6 py-3 border-t border-border bg-white text-xs text-ink/40">
              Only the studio owner or admin can reply from Daythread.
            </div>
          </div>
        ) : (
          <div className="hidden md:flex flex-1 items-center justify-center text-ink/40 text-sm">Select a conversation</div>
        )}
      </div>
    </div>
  );
}
