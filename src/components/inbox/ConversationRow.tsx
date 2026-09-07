import Link from "next/link";
import type { ChannelType } from "@prisma/client";
import { cn, initials } from "@/lib/utils";
import { ChannelBadge, CHANNEL_META } from "@/lib/channelIcons";

/**
 * One conversation in the list. The same row draws the real inbox and the marketing
 * demo, so what a visitor sees on the site is what they get. Hierarchy in three
 * weights: name (who), channel + time (where and when), preview (what). Unread is a
 * heavier name and a violet dot; waiting on you is a coral dot and a coral word — two
 * states, two colors, never more.
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

export function ConversationRow({ name, channel, time, timeISO, preview, fromYou, unread, waiting, isPerson = true, categoryLabel, subject, assigneeName, active, href, onClick, tools, className, style, as = "li" }: ConversationRowProps) {
  const body = (
    <>
      <span aria-hidden className={cn("absolute left-0 top-3 bottom-3 w-[3px] rounded-r-full bg-accent transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] origin-center", active ? "scale-y-100" : "scale-y-0")} />
      {tools && <div className="absolute right-3 top-2.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-150 hidden md:block">{tools}</div>}
      <div className={cn("flex items-center gap-3 mb-1", tools && "md:group-hover:pr-32 md:group-focus-within:pr-32")}>
        <div className={cn("relative w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 transition-colors", isPerson ? "bg-accent-soft text-accent-text" : "bg-black/[0.05] text-ink/60")}>
          {initials(name)}
          {(waiting || unread) && <span aria-hidden className={cn("absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-white", waiting ? "bg-accent" : "bg-signal")} />}
        </div>
        <span className={cn("text-[14px] truncate flex-1 leading-tight", isPerson ? (unread ? "font-extrabold text-ink" : "font-semibold text-ink") : unread ? "font-semibold text-ink/80" : "font-medium text-ink/70")}>{name}</span>
        {!isPerson && categoryLabel && <span className="text-[10px] font-bold rounded-full px-1.5 py-0.5 shrink-0 bg-black/[0.05] text-ink/65">{categoryLabel}</span>}
        {assigneeName && <span title={`Assigned to ${assigneeName}`} className="w-5 h-5 rounded-full bg-signal text-white text-[9px] font-extrabold flex items-center justify-center shrink-0">{initials(assigneeName)}</span>}
        <time dateTime={timeISO} suppressHydrationWarning className={cn("text-[11px] shrink-0 tabular-nums", unread ? "text-ink/70 font-semibold" : "text-ink/60")}>{time}</time>
      </div>
      <div className="flex items-center gap-1.5 text-xs text-ink/60 mb-1 pl-12">
        <ChannelBadge channel={channel} />
        <span>{CHANNEL_META[channel].label}</span>
        {subject && !isPerson && <span className="truncate">· {subject}</span>}
        {waiting && <span className="ml-auto text-[11px] font-semibold text-accent-text shrink-0">Waiting on you</span>}
      </div>
      <p className={cn("text-[13px] leading-snug line-clamp-2 pl-12", isPerson ? (unread ? "text-ink/85" : "text-ink/65") : "text-ink/65")}>
        {fromYou && <span className="text-ink/60">You: </span>}
        {preview}
      </p>
    </>
  );
  const cls = cn(
    "group relative block w-full text-left px-4 md:px-5 py-3.5 border-b border-border transition-colors duration-150 hover:bg-black/[0.025] focus-visible:outline-none focus-visible:bg-black/[0.03] focus-within:bg-black/[0.02] cursor-pointer",
    active && "bg-accent-soft/40 hover:bg-accent-soft/50",
    !isPerson && !active && "bg-paper/40",
    className
  );
  const Wrap = as;
  return (
    <Wrap style={style} className={as === "li" ? undefined : "contents"}>
      {href ? (
        <Link href={href} aria-current={active ? "true" : undefined} className={cls}>{body}</Link>
      ) : (
        <button type="button" onClick={onClick} aria-current={active ? "true" : undefined} className={cls}>{body}</button>
      )}
    </Wrap>
  );
}
