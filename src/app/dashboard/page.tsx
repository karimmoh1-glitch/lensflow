import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowRight, MessageSquareText, Sparkles } from "lucide-react";
import { requireBusiness, homeRouteFor, STAFF_ROLES } from "@/lib/auth";
import { getTodayBrief, buildBriefText } from "@/server/dashboardData";
import { Card, Badge, EmptyState } from "@/components/ui";
import { formatMoney, cn, initials, toZonedDisplayDate } from "@/lib/utils";
import { format, formatDistanceToNowStrict } from "date-fns";
import { FixMyDayButton } from "./FixMyDayButton";

export default async function TodayPage() {
  const ctx = await requireBusiness();
  if (!ctx) redirect("/login");
  if (!STAFF_ROLES.includes(ctx.role)) redirect(homeRouteFor(ctx.role, ctx.business));
  const { business, user } = ctx;

  const brief = await getTodayBrief(business.id);
  const briefText = buildBriefText(brief, business.name);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const firstName = user.name.split(" ")[0];

  // The single most actionable thing on the page — everything below is context, this is
  // the instruction. Ranked by how much a client is actively waiting on the business:
  // an unanswered message first (someone is sitting with a question right now), scored
  // highest-value/most-urgent first within that.
  const waitingOnReply = brief.leads.all.filter((l) => !l.lead.respondedAt).slice(0, 3);

  return (
    <div className="max-w-4xl mx-auto px-6 md:px-8 py-8 md:py-10">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-7">
        <div>
          <h1 className="font-sans font-black text-page-title text-ink tracking-tight">
            {greeting}, {firstName}.
          </h1>
          <p className="text-sm text-ink/70 mt-1">{format(new Date(), "EEEE, MMMM d")}</p>
        </div>
        <FixMyDayButton />
      </div>

      <PriorityZone waitingOnReply={waitingOnReply} briefText={briefText} totalNeedsResponse={brief.leads.needsResponse.length} />

      <div className="grid grid-cols-2 sm:flex sm:items-center gap-x-6 gap-y-4 sm:gap-8 my-9 pb-6 border-b border-border">
        <Stat label="Bookings today" value={String(brief.todaysBookings.length)} />
        <Stat label="Outstanding" value={formatMoney(brief.money.outstandingCents)} tone={brief.money.outstandingCents > 0 ? "warning" : undefined} />
        <Stat label="Hot leads" value={String(brief.leads.hot.length)} tone={brief.leads.hot.length > 0 ? "accent" : undefined} />
        <Stat label="Collected all-time" value={formatMoney(brief.money.collectedCents)} muted />
      </div>

      <div className="grid lg:grid-cols-2 gap-10">
        <div>
          <SectionLabel>Today&apos;s bookings</SectionLabel>
          {brief.todaysBookings.length === 0 ? (
            <EmptyState title="Nothing on the calendar today" description="Enjoy the quiet, or reach out to a warm lead." />
          ) : (
            <BookingList bookings={brief.todaysBookings} timeFormat="h:mm a" timezone={business.timezone} />
          )}

          <SectionLabel className="mt-8">Upcoming</SectionLabel>
          {brief.upcoming.length === 0 ? (
            <EmptyState title="No upcoming bookings yet" description="Confirmed bookings from your inbox or booking page will line up here." />
          ) : (
            <BookingList bookings={brief.upcoming} timeFormat="MMM d, h:mm a" timezone={business.timezone} linked />
          )}
        </div>

        <div>
          <SectionLabel>Hot leads</SectionLabel>
          {brief.leads.hot.length === 0 ? (
            <EmptyState title="No hot leads right now" description="New inquiries will show up here as they come in." />
          ) : (
            <Card>
              <div className="divide-y divide-border">
                {brief.leads.hot.map(({ lead, score }) => (
                  <Link
                    key={lead.id}
                    href={lead.conversationId ? `/dashboard/inbox?c=${lead.conversationId}` : "/dashboard/inbox"}
                    className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-black/[0.02]"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{lead.extractedName || "Unknown"}</div>
                      <div className="text-xs text-ink/65">
                        {lead.requestedDateText && `${lead.requestedDateText} · `}
                        {formatMoney(lead.estimatedValueCents)}
                      </div>
                    </div>
                    <span className="flex items-center gap-1.5 text-xs font-medium text-accent-text shrink-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                      {score}
                    </span>
                  </Link>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * The page's whole reason for existing: tell the owner the one thing that most needs them
 * right now, not a wall of equally-weighted stats they have to interpret themselves. When
 * there's nothing waiting, say so plainly rather than leaving a blank space — "caught up"
 * is itself useful information, not an empty state to apologize for.
 */
function PriorityZone({
  waitingOnReply,
  briefText,
  totalNeedsResponse,
}: {
  waitingOnReply: { lead: { id: string; extractedName: string | null; conversationId: string | null; lastInboundAt: Date | null; intent: string }; score: number }[];
  briefText: string;
  totalNeedsResponse: number;
}) {
  if (waitingOnReply.length === 0) {
    return (
      <div className="rounded-2xl border border-success/25 bg-success-soft/50 px-5 py-4 flex items-center gap-3">
        <span className="w-8 h-8 rounded-full bg-success/15 text-success flex items-center justify-center shrink-0">
          <Sparkles className="w-4 h-4" strokeWidth={2} />
        </span>
        <p className="text-sm text-ink/80">{briefText}</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-accent/25 bg-gradient-to-br from-accent-soft/60 to-transparent p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-accent-text">
          {totalNeedsResponse === 1 ? "Needs your reply" : `${totalNeedsResponse} conversations need your reply`}
        </div>
        {totalNeedsResponse > waitingOnReply.length && (
          <Link href="/dashboard/inbox" className="text-xs font-medium text-accent-text hover:underline shrink-0">
            See all {totalNeedsResponse}
          </Link>
        )}
      </div>
      <div className="space-y-2">
        {waitingOnReply.map(({ lead, score }) => (
          <Link
            key={lead.id}
            href={lead.conversationId ? `/dashboard/inbox?c=${lead.conversationId}` : "/dashboard/inbox"}
            className="flex items-center gap-3 rounded-xl bg-white/80 hover:bg-white border border-accent/15 px-3.5 py-3 transition-colors group"
          >
            <span className="w-8 h-8 rounded-full bg-accent-soft text-accent-text flex items-center justify-center text-[11px] font-semibold shrink-0">
              {initials(lead.extractedName || "?")}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-ink truncate">{lead.extractedName || "Unknown"}</div>
              <div className="text-xs text-ink/60 truncate">
                {lead.lastInboundAt ? `Waiting ${formatDistanceToNowStrict(lead.lastInboundAt)}` : "New inquiry"}
                {score >= 70 && " · High intent"}
              </div>
            </div>
            <MessageSquareText className="w-4 h-4 text-accent-text/50 shrink-0 group-hover:text-accent-text transition-colors" strokeWidth={2} />
            <ArrowRight className="w-3.5 h-3.5 text-accent-text/40 shrink-0 group-hover:translate-x-0.5 transition-transform" strokeWidth={2} />
          </Link>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value, tone, muted }: { label: string; value: string; tone?: "warning" | "accent"; muted?: boolean }) {
  return (
    <div className="shrink-0">
      <div className="text-xs text-ink/65 mb-0.5">{label}</div>
      <div
        className={cn(
          "font-display text-xl",
          muted ? "text-ink/70" : tone === "warning" ? "text-warning-text" : tone === "accent" ? "text-accent-text" : "text-ink"
        )}
      >
        {value}
      </div>
    </div>
  );
}

function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <h2 className={cn("text-sm font-medium text-ink mb-2.5", className)}>{children}</h2>;
}

function BookingList({
  bookings,
  timeFormat,
  timezone,
  linked,
}: {
  bookings: { id: string; startAt: Date; status: string; service: { name: string }; client: { name: string } }[];
  timeFormat: string;
  timezone: string;
  linked?: boolean;
}) {
  return (
    <Card>
      <div className="divide-y divide-border">
        {bookings.map((b) => {
          const row = (
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">
                  {format(toZonedDisplayDate(b.startAt, timezone), timeFormat)} — {b.service.name}
                </div>
                <div className="text-xs text-ink/65">{b.client.name}</div>
              </div>
              <StatusBadge status={b.status} />
            </div>
          );
          return linked ? (
            <Link key={b.id} href={`/dashboard/bookings/${b.id}`} className="block hover:bg-black/[0.02]">
              {row}
            </Link>
          ) : (
            <div key={b.id}>{row}</div>
          );
        })}
      </div>
    </Card>
  );
}

const STATUS_TONE: Record<string, "neutral" | "success" | "warning" | "info" | "danger"> = {
  INQUIRY: "neutral",
  BOOKED: "info",
  DEPOSIT_PAID: "warning",
  CONFIRMED: "success",
  QUESTIONNAIRE_COMPLETE: "success",
  UPCOMING: "success",
  COMPLETED: "neutral",
  BALANCE_PAID: "success",
  FOLLOWED_UP: "neutral",
  CANCELED: "danger",
};

function StatusBadge({ status }: { status: string }) {
  return <Badge tone={STATUS_TONE[status] ?? "neutral"}>{status.replaceAll("_", " ").toLowerCase()}</Badge>;
}
