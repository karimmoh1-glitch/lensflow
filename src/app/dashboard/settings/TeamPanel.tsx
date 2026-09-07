import Link from "next/link";
import { prisma } from "@/lib/db";
import { Badge, Card, SectionLabel } from "@/components/ui";
import { planLimits, effectivePlan, PLANS, teamEntitled } from "@/lib/billing";
import { initials } from "@/lib/utils";
import { format } from "date-fns";
import type { Business } from "@prisma/client";
import { TeamInviteForm } from "./TeamInviteForm";
import { InvitationRow } from "./InvitationRow";
import { MemberActions } from "./MemberActions";

const ROLE_LABEL: Record<string, string> = { OWNER: "Owner", ADMIN: "Admin", PHOTOGRAPHER: "Teammate", PARTNER: "Teammate" };

/**
 * Settings → Team (Pro). Who shares this inbox, who's been invited, and one form to invite
 * more. Seats are counted and enforced on the server; this panel only shows the arithmetic.
 */
export async function TeamPanel({ business }: { business: Business }) {
  const entitled = teamEntitled(business);
  const [members, invitations] = await Promise.all([
    prisma.orgMembership.findMany({
      where: { businessId: business.id, role: { in: ["OWNER", "ADMIN", "PHOTOGRAPHER", "PARTNER"] } },
      include: { user: { select: { name: true, email: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.invitation.findMany({
      where: { businessId: business.id, role: { in: ["ADMIN", "PHOTOGRAPHER", "PARTNER"] } },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  const limits = planLimits(business);
  const plan = effectivePlan(business);
  const seats = members.filter((m) => m.status === "ACTIVE").length;
  const pendingSeats = invitations.filter((i) => i.status === "PENDING").length;
  const capped = Number.isFinite(limits.maxTeamSeats);
  const full = capped && seats + pendingSeats >= limits.maxTeamSeats;
  const over = capped && seats > limits.maxTeamSeats;

  return (
    <div className="space-y-8">
      {!entitled && (
        <div className="rounded-[22px] border border-signal/25 bg-signal-soft/40 px-5 py-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-signal-text">Daythread Pro</p>
          <h2 className="mt-1.5 font-sans font-extrabold text-xl tracking-[-0.02em] text-ink">Share this inbox with your team.</h2>
          <p className="mt-1.5 text-sm text-ink/65 leading-relaxed max-w-lg">Pro includes up to {PLANS.PRO.maxTeamSeats} people on one inbox: everyone sees the same conversations, and any thread can be assigned to whoever should answer it.</p>
          <Link href="/dashboard/settings?tab=subscription" className="mt-4 inline-flex items-center h-10 px-5 rounded-full bg-ink text-white text-sm font-bold hover:bg-black transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50">Upgrade to Pro →</Link>
        </div>
      )}

      {over && (
        <div role="alert" className="rounded-2xl border border-warning/40 bg-warning-soft/60 px-4 py-3 text-sm text-ink/80">
          <span className="font-semibold text-ink">{seats} people; {PLANS[plan].name} includes {limits.maxTeamSeats}.</span> Everyone keeps access. New invitations are paused until you deactivate someone{plan === "FREE" ? " or upgrade to Pro" : ""}.
        </div>
      )}
      {entitled && full && !over && (
        <div className="rounded-2xl border border-border bg-paper/70 px-4 py-3 text-sm text-ink/80">
          <span className="font-semibold text-ink">Team is full.</span> Pro includes {limits.maxTeamSeats} people{pendingSeats ? ` (${pendingSeats} invitation${pendingSeats === 1 ? "" : "s"} pending)` : ""}. Deactivate someone or revoke an invitation to free a seat.
        </div>
      )}

      <div>
        <SectionLabel hint={capped ? `${seats} of ${limits.maxTeamSeats}` : `${seats} · unlimited`}>People on this inbox</SectionLabel>
        <Card>
          <ul className="divide-y divide-border">
            {members.map((m) => (
              <li key={m.id} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 px-4 py-3.5">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-accent-soft text-accent-text flex items-center justify-center text-xs font-semibold shrink-0">{initials(m.user.name)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {m.user.name}
                      {m.status === "SUSPENDED" && <span className="text-danger-text font-normal"> · Deactivated</span>}
                    </div>
                    <div className="text-xs text-ink/65 truncate">{m.user.email}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3 pl-11 sm:pl-0 shrink-0">
                  <Badge tone={m.role === "OWNER" ? "accent" : "neutral"}>{ROLE_LABEL[m.role] ?? "Teammate"}</Badge>
                  <MemberActions membershipId={m.id} role={m.role} status={m.status} />
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {entitled && (
        <div>
          <SectionLabel hint="they get an email with a link">Invite a teammate</SectionLabel>
          <TeamInviteForm />
        </div>
      )}

      {invitations.length > 0 && (
        <div>
          <SectionLabel>Invitations</SectionLabel>
          <Card>
            <div className="divide-y divide-border">
              {invitations.map((i) => (
                <InvitationRow key={i.id} id={i.id} email={i.email} status={i.status} createdAt={format(i.createdAt, "MMM d")} token={i.token} />
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
