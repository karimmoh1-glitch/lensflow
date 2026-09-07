import { prisma } from "@/lib/db";
import { Card, Badge, SectionLabel } from "@/components/ui";
import Link from "next/link";
import { planLimits, effectivePlan, PLANS, limitLabel, nextPlan as nextPlanOf } from "@/lib/billing";
import { initials } from "@/lib/utils";
import { format } from "date-fns";
import { PartnerInviteForm } from "@/app/dashboard/team/PartnerInviteForm";
import { InvitationRow } from "@/app/dashboard/team/InvitationRow";
import { MemberActions } from "@/app/dashboard/team/MemberActions";
import { JoinRequestRow } from "@/app/dashboard/team/JoinRequestRow";
import { ConversationAccessToggle } from "@/app/dashboard/team/ConversationAccessToggle";
import { TeamInviteForm } from "./TeamInviteForm";
import { teamEntitled } from "@/lib/billing";
import type { Business } from "@prisma/client";

const ROLE_LABEL: Record<string, string> = { OWNER: "Owner", ADMIN: "Admin", PHOTOGRAPHER: "Team member", PARTNER: "Partner", CLIENT: "Client" };

export async function TeamPanel({ business, role }: { business: Business; role: string }) {
  const entitled = teamEntitled(business);
  void role;

  const [members, invitations, joinRequests] = await Promise.all([
    prisma.orgMembership.findMany({
      where: { businessId: business.id, role: { in: ["OWNER", "ADMIN", "PHOTOGRAPHER", "PARTNER"] } },
      include: { user: true, assignedBookings: { where: { status: { notIn: ["CANCELED", "COMPLETED", "BALANCE_PAID", "FOLLOWED_UP"] } } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.invitation.findMany({
      where: { businessId: business.id, role: { in: ["ADMIN", "PHOTOGRAPHER", "PARTNER"] } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.joinRequest.findMany({
      where: { businessId: business.id, status: "PENDING" },
      include: { user: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const limits = planLimits(business);
  const plan = effectivePlan(business);
  const seats = members.filter((m) => m.status === "ACTIVE").length;
  const pendingSeats = invitations.filter((i) => i.status === "PENDING").length;
  const capped = Number.isFinite(limits.maxTeamSeats);
  const full = capped && seats + pendingSeats >= limits.maxTeamSeats;
  const over = capped && seats > limits.maxTeamSeats;
  const nextPlan = nextPlanOf(plan);

  return (
    <div className="dt-stagger">
      {!entitled && (
        <div className="mb-8 rounded-[22px] border border-signal/25 bg-signal-soft/40 px-5 py-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-signal-text">Daythread Business</p>
          <h2 className="mt-1.5 font-sans font-extrabold text-xl tracking-[-0.02em] text-ink">Run the inbox as a team.</h2>
          <p className="mt-1.5 text-sm text-ink/65 leading-relaxed max-w-lg">Business includes up to {PLANS.BUSINESS.maxTeamSeats} people on one shared inbox: everyone sees the same conversations, any thread can be assigned to whoever should answer it, and partners can be handed bookings.</p>
          <Link href="/dashboard/settings?tab=subscription" className="mt-4 inline-flex items-center h-10 px-5 rounded-full bg-ink text-white text-sm font-bold hover:bg-black transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50">Upgrade to Business →</Link>
        </div>
      )}
      <div className="flex items-baseline justify-between gap-3 mb-4">
        <h2 className="font-sans font-extrabold text-lg tracking-[-0.02em] text-ink">Team</h2>
        <span className="text-xs font-semibold text-ink/55 tabular-nums">{capped ? `${seats} of ${limits.maxTeamSeats}` : `${seats} · unlimited`} <span className="text-ink/40">· {PLANS[plan].name}</span></span>
      </div>

      {over && (
        <div role="alert" className="mb-5 rounded-2xl border border-warning/40 bg-warning-soft/60 px-4 py-3 text-sm text-ink/80">
          <span className="font-semibold text-ink">{seats} team members; {PLANS[plan].name} includes {limits.maxTeamSeats}.</span> Everyone keeps access. New invitations are paused until you upgrade or deactivate someone.{nextPlan && <Link href="/dashboard/settings?tab=subscription" className="ml-2 font-semibold text-signal-text hover:underline">See plans →</Link>}
        </div>
      )}
      {full && !over && nextPlan && (
        <div className="mb-5 rounded-2xl border border-signal/25 bg-signal-soft/40 px-4 py-3 text-sm text-ink/80 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span><span className="font-semibold text-ink">Team is full.</span> {PLANS[plan].name} includes {limits.maxTeamSeats} team member{limits.maxTeamSeats === 1 ? "" : "s"}{pendingSeats ? ` (${pendingSeats} invitation${pendingSeats === 1 ? "" : "s"} pending)` : ""}. {PLANS[nextPlan].name} includes {limitLabel(PLANS[nextPlan].maxTeamSeats).toLowerCase()}.</span>
          <Link href="/dashboard/settings?tab=subscription" className="text-signal-text font-semibold hover:underline">Upgrade →</Link>
        </div>
      )}

      <div className="mb-10">
        <SectionLabel hint={`${seats} active`}>Members</SectionLabel>
        <Card>
          <div className="divide-y divide-border">
            {members.map((m) => (
              <div key={m.id} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 px-4 py-3.5">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-accent-soft text-accent-text flex items-center justify-center text-xs font-semibold shrink-0">
                    {initials(m.user.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {m.user.name}
                      {m.status === "SUSPENDED" && <span className="text-danger-text font-normal"> · Deactivated</span>}
                    </div>
                    <div className="text-xs text-ink/65 truncate">
                      {m.user.email}
                      {m.role === "PARTNER" &&
                        ` · ${m.assignedBookings.length} upcoming ${m.assignedBookings.length === 1 ? "project" : "projects"}`}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 pl-11 sm:pl-0 shrink-0">
                  {m.role === "PARTNER" && <ConversationAccessToggle membershipId={m.id} canViewAll={m.canViewAllConversations} />}
                  <Badge tone={m.role === "OWNER" ? "accent" : "neutral"}>{ROLE_LABEL[m.role]}</Badge>
                  <MemberActions membershipId={m.id} role={m.role} status={m.status} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {joinRequests.length > 0 && (
        <div className="mb-10">
          <SectionLabel tone="accent" hint="people who asked to join">Join requests</SectionLabel>
          <Card>
            <div className="divide-y divide-border">
              {joinRequests.map((r) => (
                <JoinRequestRow key={r.id} id={r.id} name={r.user.name} email={r.user.email} />
              ))}
            </div>
          </Card>
        </div>
      )}

      {entitled && (
        <>
          <div className="mb-10">
            <SectionLabel hint="shares the inbox with you">Invite a teammate</SectionLabel>
            <TeamInviteForm />
          </div>
          <div className="mb-10">
            <SectionLabel hint="someone you hand bookings to; sees only what's assigned">Invite a partner</SectionLabel>
            <PartnerInviteForm />
          </div>
        </>
      )}

      {invitations.length > 0 && (
        <div>
          <SectionLabel>Invitations</SectionLabel>
          <Card>
            <div className="divide-y divide-border">
              {invitations.map((inv) => (
                <InvitationRow
                  key={inv.id}
                  id={inv.id}
                  email={inv.email}
                  role={ROLE_LABEL[inv.role]}
                  status={inv.status}
                  createdAt={format(inv.createdAt, "MMM d, yyyy")}
                  token={inv.token}
                />
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
