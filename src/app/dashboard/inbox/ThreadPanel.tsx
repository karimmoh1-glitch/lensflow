import { requireBusiness } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import { format, formatDistanceToNowStrict, differenceInMinutes } from "date-fns";
import { ChevronLeft, Mail, Phone, AtSign } from "lucide-react";
import { cn, initials, toZonedDisplayDate } from "@/lib/utils";
import { Composer, type WindowNotice } from "./Composer";
import { ChannelBadge, CHANNEL_META } from "@/lib/channelIcons";
import { MessageBody } from "./MessageBody";
import { ConversationTools, MarkReadOnOpen } from "./ConversationTools";
import { SummaryCard } from "./SummaryCard";
import { AssignMenu } from "./AssignMenu";
import { teamEntitled } from "@/lib/billing";
import { splitMessage } from "@/lib/cleanMessage";
import { readMessage, type ConversationSummary } from "@/lib/summarize";
import { labelFor } from "@/lib/classifyMessage";

/**
 * One conversation, and beside it what you need to answer it: who this is and how to
 * reach them, what they mentioned (read from their own words), a summary, and your
 * previous conversations with them. The rail is a sidebar on desktop and a disclosure on
 * phones. Every message shows whether it was actually delivered.
 */
export async function ThreadPanel({ conversationId, autoSummarize = false, backHref = "/dashboard/inbox" }: { conversationId: string; autoSummarize?: boolean; backHref?: string }) {
  const ctx = await requireBusiness();
  if (!ctx) redirect("/login");
  const { business } = ctx;

  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, businessId: business.id },
    include: {
      client: {
        include: {
          conversations: { where: { id: { not: conversationId }, archived: false }, orderBy: { lastMessageAt: "desc" }, take: 5, select: { id: true, channel: true, subject: true, lastMessageAt: true, messages: { orderBy: { createdAt: "desc" }, take: 1, select: { body: true } } } },
        },
      },
      messages: { orderBy: { createdAt: "asc" } },
      lead: { include: { service: { select: { name: true } } } },
    },
  });

  if (!conversation) return <div className="flex-1 flex items-center justify-center text-ink/60 text-sm">Conversation not found</div>;

  const lead = conversation.lead;
  const client = conversation.client;
  const team = teamEntitled(business);
  const members = team
    ? await prisma.orgMembership.findMany({ where: { businessId: business.id, status: "ACTIVE", role: { in: ["OWNER", "ADMIN", "PHOTOGRAPHER", "PARTNER"] } }, include: { user: { select: { name: true } } }, orderBy: { createdAt: "asc" } })
    : [];

  const displayName = client?.name ?? lead?.extractedName ?? conversation.externalHandle ?? "Unknown";
  const isPerson = conversation.category === "PRIORITY";
  const lastInboundMsg = [...conversation.messages].reverse().find((m) => m.direction === "INBOUND");
  const lastMsg = conversation.messages[conversation.messages.length - 1];
  const unread = Boolean(lastInboundMsg && (!conversation.lastReadAt || conversation.lastReadAt < lastInboundMsg.createdAt));
  const waitingOnYou = isPerson && lastMsg?.direction === "INBOUND";
  const latestText = lastInboundMsg ? splitMessage(lastInboundMsg.body).text : "";
  const mentioned = isPerson && latestText ? readMessage(latestText) : null;
  const cachedSummary = (conversation.summary as unknown as ConversationSummary | null) ?? null;
  const tz = business.timezone;

  // WhatsApp's 24-hour customer-service window, told before the person writes. The server
  // refuses the send either way; this only means they find out first.
  let windowNotice: WindowNotice = null;
  if (conversation.channel === "WHATSAPP") {
    if (!lastInboundMsg) windowNotice = { open: false, text: "WhatsApp only allows replies within 24 hours of a customer's message, and nobody has written yet. A note here is saved to the thread, not delivered." };
    else {
      const minutesLeft = 24 * 60 - differenceInMinutes(new Date(), lastInboundMsg.createdAt);
      if (minutesLeft <= 0) windowNotice = { open: false, text: "WhatsApp's 24-hour reply window has closed for this conversation. A note here is saved to the thread; it will be delivered only if they write again first, or with an approved template." };
      else windowNotice = { open: true, endsIn: minutesLeft >= 60 ? `${Math.floor(minutesLeft / 60)}h ${minutesLeft % 60}m` : `${minutesLeft}m` };
    }
  }

  const handle = conversation.externalHandle?.replace(/^@/, "").toLowerCase() ?? null;
  const contact = [
    client?.email ? { icon: Mail, value: client.email, href: `mailto:${client.email}` } : null,
    client?.phone ? { icon: Phone, value: client.phone, href: `tel:${client.phone}` } : null,
    client?.instagram ? { icon: AtSign, value: client.instagram.replace(/^@/, ""), href: `https://instagram.com/${client.instagram.replace(/^@/, "")}` } : null,
  ].filter((x): x is NonNullable<typeof x> => x !== null && x.value.replace(/^@/, "").toLowerCase() !== handle);
  const facts = lead ? [
    lead.service ? { label: "About", value: lead.service.name } : null,
    lead.requestedDateText ? { label: "Date", value: lead.requestedDateText } : null,
    lead.requestedLocation ? { label: "Location", value: lead.requestedLocation } : null,
    lead.budgetCents ? { label: "Amount", value: `$${(lead.budgetCents / 100).toLocaleString()}` } : null,
  ].filter((x): x is NonNullable<typeof x> => Boolean(x)) : [];
  if (mentioned?.day && !facts.some((f) => f.label === "Date")) facts.push({ label: "Date", value: [mentioned.day, mentioned.time].filter(Boolean).join(" · ") });
  if (mentioned?.amountCents && !facts.some((f) => f.label === "Amount")) facts.push({ label: "Amount", value: `$${(mentioned.amountCents / 100).toLocaleString()}` });

  const rail = (
    <>
      <div className="px-5 pt-5 pb-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className={cn("w-10 h-10 rounded-full flex items-center justify-center text-xs font-semibold shrink-0", isPerson ? "bg-accent-soft text-accent-text" : "bg-black/[0.05] text-ink/50")}>
            {initials(displayName)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold truncate">{displayName}</div>
            <div className="text-xs text-ink/65 truncate">{isPerson ? `${CHANNEL_META[conversation.channel].label}${conversation.externalHandle ? ` · ${conversation.externalHandle}` : ""}` : labelFor(conversation.category)}</div>
          </div>
        </div>
        {contact.length > 0 && (
          <ul className="mt-3 space-y-1">
            {contact.map((c) => (
              <li key={c.value}>
                <a href={c.href} target={c.href.startsWith("http") ? "_blank" : undefined} rel="noreferrer" className="inline-flex items-center gap-2 text-xs text-ink/70 hover:text-ink max-w-full">
                  <c.icon className="w-3.5 h-3.5 text-ink/40 shrink-0" strokeWidth={2} aria-hidden />
                  <span className="truncate">{c.value}</span>
                </a>
              </li>
            ))}
          </ul>
        )}
        {!isPerson && conversation.categoryReason && <p className="mt-2.5 text-xs text-ink/60">{conversation.categoryReason}</p>}
        {waitingOnYou && lastInboundMsg && (
          <p className="mt-3 text-xs text-ink/70 leading-snug" suppressHydrationWarning>
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent mr-1.5 align-middle" />
            Waiting {formatDistanceToNowStrict(lastInboundMsg.createdAt)} for a reply.
          </p>
        )}
        {!waitingOnYou && isPerson && lastMsg?.direction === "OUTBOUND" && (
          <p className="mt-3 text-xs text-ink/60 leading-snug" suppressHydrationWarning>
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-success mr-1.5 align-middle" />
            You replied {formatDistanceToNowStrict(lastMsg.createdAt)} ago.
          </p>
        )}
      </div>

      <div className="px-5 py-4 space-y-4">
        {mentioned && (
          <div className="rounded-2xl border border-border bg-paper/70 px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-ink/55 mb-1">Latest message</div>
            <div className="text-sm font-semibold text-ink">{mentioned.intentLabel}</div>
            {latestText && <p className="mt-1 text-xs text-ink/60 line-clamp-3">“{latestText.replace(/\s+/g, " ").slice(0, 200)}”</p>}
          </div>
        )}

        {facts.length > 0 && (
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-ink/60 mb-2">They mentioned</div>
            <dl className="space-y-1.5 text-sm">
              {facts.map((f) => <Row key={f.label} label={f.label} value={f.value} />)}
            </dl>
          </div>
        )}

        {isPerson && <SummaryCard conversationId={conversation.id} initial={cachedSummary} autoRun={autoSummarize} />}

        {client && client.conversations.length > 0 && (
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-ink/60 mb-2">Previous conversations</div>
            <ul className="space-y-1.5">
              {client.conversations.map((c) => (
                <li key={c.id}>
                  <Link href={`/dashboard/inbox?c=${c.id}`} className="flex items-start gap-2 rounded-xl px-2 py-1.5 -mx-2 hover:bg-black/[0.03]">
                    <ChannelBadge channel={c.channel} className="mt-0.5" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-semibold text-ink truncate">{c.subject ?? CHANNEL_META[c.channel].label}</span>
                      <span className="block text-[11px] text-ink/55 truncate">{splitMessage(c.messages[0]?.body ?? "").text.slice(0, 80)}</span>
                    </span>
                    <span className="text-[11px] text-ink/40 shrink-0">{format(toZonedDisplayDate(c.lastMessageAt, tz), "MMM d")}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </>
  );

  return (
    <div className="flex-1 flex min-w-0 min-h-0 h-full">
      <MarkReadOnOpen conversationId={conversation.id} unread={unread} />
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <div className="px-3 md:px-6 py-2.5 md:py-3 border-b border-border bg-white flex items-center gap-2 md:gap-3 pt-[max(0.625rem,env(safe-area-inset-top))] md:pt-3">
          <Link href={backHref} className="lg:hidden -ml-1 w-10 h-10 flex items-center justify-center rounded-lg hover:bg-black/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50" aria-label="Back to inbox">
            <ChevronLeft className="w-5 h-5 text-ink/60" strokeWidth={2} />
          </Link>
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-sm truncate">{displayName}</h2>
            <div className="flex items-center gap-1.5 text-xs text-ink/65 truncate">
              <ChannelBadge channel={conversation.channel} />
              {CHANNEL_META[conversation.channel].label}
              {conversation.externalHandle ? ` · ${conversation.externalHandle}` : ""}
              {conversation.subject ? ` · ${conversation.subject}` : ""}
            </div>
          </div>
          {waitingOnYou && (
            <span className="hidden 2xl:inline-flex items-center gap-1.5 text-xs font-medium text-accent-text shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-accent" />
              Waiting on you
            </span>
          )}
          {team && <AssignMenu conversationId={conversation.id} members={members.map((m) => ({ membershipId: m.id, name: m.user.name, role: m.role }))} current={conversation.assigneeMembershipId} />}
          <ConversationTools conversationId={conversation.id} unread={unread} category={conversation.category} variant="header" />
        </div>

        <details className="xl:hidden border-b border-border bg-paper/60 group/ctx">
          <summary className="flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-ink/70 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden min-h-[44px]">
            <span className="w-1.5 h-1.5 rounded-full bg-signal" />
            About {displayName}
            {mentioned && <span className="ml-1 text-ink/45 font-medium truncate">· {mentioned.intentLabel}</span>}
            <span className="ml-auto text-ink/40 transition-transform group-open/ctx:rotate-180" aria-hidden>▾</span>
          </summary>
          <div className="max-h-[60vh] overflow-y-auto scrollbar-thin bg-white border-t border-border">{rail}</div>
        </details>

        <div className="flex-1 overflow-y-auto scrollbar-thin px-4 md:px-6 py-6 space-y-4 overscroll-contain">
          {conversation.messages.map((m) => (
            <div key={m.id} className={cn("max-w-md dt-swap", m.direction === "OUTBOUND" ? "ml-auto" : "")}>
              <div
                className={cn(
                  "rounded-2xl px-4 py-2.5 text-sm",
                  m.status === "FAILED"
                    ? "bg-danger-soft text-danger-text rounded-br-sm border border-danger/30"
                    : m.status === "NOT_DELIVERED"
                      ? "bg-warning-soft/60 text-ink rounded-br-sm border border-warning/40"
                    : m.direction === "OUTBOUND"
                      ? "bg-ink text-white rounded-br-sm"
                      : "bg-black/[0.05] text-ink rounded-bl-sm"
                )}
              >
                <MessageBody body={m.body} outbound={m.direction === "OUTBOUND"} />
              </div>
              <div className={cn("text-[11px] text-ink/50 mt-1", m.direction === "OUTBOUND" ? "text-right" : "")}>
                {m.status === "FAILED" && <span className="text-danger-text">Failed to send · </span>}
                {m.status === "NOT_DELIVERED" && <span className="text-warning-text">Not delivered — {CHANNEL_META[conversation.channel].label} isn&rsquo;t connected · </span>}
                {m.aiDrafted && <span className="text-signal-text">AI drafted · </span>}
                {m.direction === "OUTBOUND" && !m.sentByUserId && !m.aiDrafted && <span className="text-signal-text">Sent by Daythread · </span>}
                <time dateTime={m.createdAt.toISOString()}>{format(toZonedDisplayDate(m.createdAt, tz), "MMM d, h:mm a")}</time>
              </div>
            </div>
          ))}
        </div>

        <Composer conversationId={conversation.id} windowNotice={windowNotice} />
      </div>

      <aside className="hidden xl:flex w-80 2xl:w-[22rem] shrink-0 border-l border-border bg-white flex-col overflow-y-auto scrollbar-thin" aria-label={`About ${displayName}`}>{rail}</aside>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-ink/65 shrink-0">{label}</dt>
      <dd className="font-medium text-right truncate">{value}</dd>
    </div>
  );
}
