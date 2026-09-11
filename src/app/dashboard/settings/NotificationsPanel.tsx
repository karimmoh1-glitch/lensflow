import { prisma } from "@/lib/db";
import { formatDistanceToNowStrict } from "date-fns";
import { Card, EmptyState, SectionLabel } from "@/components/ui";
import { cn } from "@/lib/utils";
import { MarkAllRead } from "./MarkAllRead";
import type { Business } from "@prisma/client";
import Link from "next/link";

/**
 * What Daythread noticed on your behalf: a new person writing, a channel that needs
 * attention, a failed subscription charge. Read from the same rows the product writes at
 * ingestion — nothing here is a preference, so there is nothing to configure.
 */
export async function NotificationsPanel({ business }: { business: Business }) {
  const rows = await prisma.notification.findMany({ where: { businessId: business.id }, orderBy: { createdAt: "desc" }, take: 40 });
  const unread = rows.filter((r) => !r.read).length;
  return (
    <div className="space-y-4">
      <SectionLabel hint={unread ? `${unread} unread` : "all read"} action={unread ? <MarkAllRead /> : undefined}>Notifications</SectionLabel>
      {rows.length === 0 ? (
        <EmptyState title="Nothing yet" description="When someone new writes to you, or a channel needs attention, it shows up here." />
      ) : (
        <Card>
          <ol className="divide-y divide-border dt-rows">
            {rows.map((n) => {
              const inner = (
                <>
                  <span aria-hidden className={cn("mt-2 w-2 h-2 rounded-full shrink-0", n.read ? "bg-ink/15" : "bg-signal")} />
                  <div className="min-w-0 flex-1">
                    <div className={cn("text-sm", n.read ? "font-medium text-ink/80" : "font-semibold text-ink")}>{n.title}</div>
                    <div className="text-xs text-ink/65 leading-relaxed">{n.body}</div>
                  </div>
                  <time dateTime={n.createdAt.toISOString()} suppressHydrationWarning className="text-[11px] text-ink/65 shrink-0 tabular-nums">{formatDistanceToNowStrict(n.createdAt)} ago</time>
                </>
              );
              const row = cn("flex items-start gap-3 px-4 py-3.5", !n.read && "bg-signal-soft/25");
              // A notice that names a record opens it; one that does not stays plain text
              // rather than pretending to be a link.
              return (
                <li key={n.id}>
                  {n.path ? (
                    <Link href={`/dashboard${n.path}`} className={cn(row, "hover:bg-black/[0.03] transition-colors")}>
                      {inner}
                    </Link>
                  ) : (
                    <div className={row}>{inner}</div>
                  )}
                </li>
              );
            })}
          </ol>
        </Card>
      )}
    </div>
  );
}
