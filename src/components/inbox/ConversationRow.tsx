import Link from "next/link";
import type { ChannelType } from "@prisma/client";
import { cn, initials } from "@/lib/utils";
import { ChannelBadge, CHANNEL_META } from "@/lib/channelIcons";

/**
 * One conversation in the list, in two lines, because a list you work through has to fit
 * a screen of people, not four:
 *
 *   [avatar] Name ··························· time
 *            [channel] what they want, or the last message
 *
 * State is carried by weight and one dot, never by a word repeated on every row:
 * unread is a heavier name and brighter text; waiting on you is a coral dot on the avatar
 * (the only coral in the list); a planned follow-up is a quiet label. Who the person is to
 * the business, and why they're here, live in the line itself, not in colored prefixes.
 */
export type ConversationRowProps = {
  name: string;
  channel: ChannelType;
  /** Short relative time, e.g. "21m". */
  time: string;
  timeISO?: string;
  preview: string;
  /** The last message was yours. */
  fromYou?: boolean;
  unread?: boolean;
  waiting?: boolean;
  /** A follow-up label from the attention rules ("Follow-up due", "Follow up"). */
  followUp?: string | null;
  /** Why this conversation is in Priority, in words ("Asked about Newborn session and is waiting for your reply."). */
  reason?: string | null;
  /** "Potential client" / "Client" — who this is to the business. */
  kindLabel?: string | null;
  isPerson?: boolean;
  categoryLabel?: string;
  subject?: string | null;
  assigneeName?: string | null;
  active?: boolean;
  href?: string;
  onClick?: () => void;
  /** Hover/focus action rail (real inbox only). */
  tools?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  as?: "li" | "div";
};

/** The reason, without the clause the dot already says. */
export function rowLine(reason: string | null | undefined, waiting: boolean | undefined): string | null {
  if (!reason) return null;
  const trimmed = reason.trim();
  if (!waiting) return trimmed;
  return trimmed.replace(/,?\s*and (is|are) waiting (on|for) (you|your reply)\.?$/i, ".").replace(/\.\.$/, ".");
}

export function ConversationRow({ name, channel, time, timeISO, preview, fromYou, unread, waiting, followUp, reason, isPerson = true, categoryLabel, subject, assigneeName, active, href, onClick, tools, className, style, as = "li" }: ConversationRowProps) {
  const line = rowLine(reason, waiting);
  const tail = [waiting ? "Waiting on your reply" : null, unread ? "Unread" : null, followUp && !waiting ? followUp : null].filter(Boolean).join(". ");
  const said = (line ?? `${fromYou ? "You: " : ""}${preview}`).trim().replace(/[.\s]+$/, "");
  const label = `${name}. ${CHANNEL_META[channel].label}, ${time}. ${said}.${tail ? ` ${tail}.` : ""}`;
  const body = (
    <>
      <span aria-hidden className={cn("absolute left-0 top-2 bottom-2 w-[2px] rounded-r-full bg-ink transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] origin-center", active ? "scale-y-100" : "scale-y-0")} />
      <div className="flex items-start gap-3">
        <div className={cn("relative mt-0.5 w-8 h-8 rounded-full flex items-center justify-center text-2xs font-semibold shrink-0", isPerson ? "bg-ink/[0.06] text-ink/75" : "bg-black/[0.035] text-ink/50")}>
          {initials(name)}
          {(waiting || unread) && <span aria-hidden className={cn("absolute -top-px -right-px w-2.5 h-2.5 rounded-full ring-2 ring-white", waiting ? "bg-accent" : "bg-ink/70")} />}
        </div>
        <div className={cn("min-w-0 flex-1", tools && "md:group-hover:pr-28 md:group-focus-within:pr-28")}>
          <div className="flex items-baseline gap-2">
            <span className={cn("text-sm truncate leading-5", unread ? "font-semibold text-ink" : isPerson ? "font-medium text-ink/90" : "font-medium text-ink/60")}>{name}</span>
            {!isPerson && categoryLabel && <span className="text-2xs font-medium text-ink/50 shrink-0">{categoryLabel}</span>}
            {assigneeName && <span title={`Assigned to ${assigneeName}`} className="w-4 h-4 rounded-full bg-ink/80 text-white text-[9.5px] leading-none font-semibold flex items-center justify-center shrink-0">{initials(assigneeName).slice(0, 1)}</span>}
            <span className="ml-auto flex items-baseline gap-2 shrink-0">
              {followUp && !waiting && <span className="text-2xs font-medium text-ink/60">{followUp}</span>}
              <time dateTime={timeISO} suppressHydrationWarning className={cn("text-xs tabular-nums", unread || waiting ? "text-ink/70" : "text-ink/50")}>{time}</time>
            </span>
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 min-w-0">
            <ChannelBadge channel={channel} className="w-3.5 h-3.5 rounded-[4px] opacity-90" />
            <p className={cn("text-13 leading-5 truncate", unread ? "text-ink/80" : "text-ink/55")}>
              {line ?? (
                <>
                  {fromYou && <span className="text-ink/45">You: </span>}
                  {subject && !isPerson ? `${subject} — ${preview}` : preview}
                </>
              )}
            </p>
          </div>
        </div>
      </div>
    </>
  );
  const cls = cn(
    "group relative block w-full text-left pl-4 pr-3 md:pl-5 md:pr-4 py-2.5 transition-colors duration-100 hover:bg-black/[0.025] focus-within:bg-black/[0.035] cursor-pointer",
    active && "bg-black/[0.04] hover:bg-black/[0.045]",
    className
  );
  const Wrap = as;
  // A link row with tools is a stretched link: the link covers the row and carries the whole
  // row as its name, and the tools sit beside it — never inside it, where they couldn't be
  // reached or announced properly.
  return (
    <Wrap style={style} className={as === "li" ? undefined : "contents"}>
      {href ? (
        <div className={cls}>
          <Link href={href} aria-current={active ? "true" : undefined} aria-label={label} className="absolute inset-0 z-0 rounded-[inherit] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink/70" />
          <div aria-hidden className="relative pointer-events-none">{body}</div>
          {tools && <div className="absolute right-2.5 top-1/2 -translate-y-1/2 z-10 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-150 hidden md:block">{tools}</div>}
        </div>
      ) : (
        <button type="button" onClick={onClick} aria-current={active ? "true" : undefined} className={cls}>{body}</button>
      )}
    </Wrap>
  );
}
