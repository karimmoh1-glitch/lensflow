import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHeader, Card, Badge, SectionLabel } from "@/components/ui";
import Link from "next/link";
import { planLimits, effectivePlan, PLANS, limitLabel } from "@/lib/billing";
import { initials } from "@/lib/utils";
import { format } from "date-fns";
import { PartnerInviteForm } from "./PartnerInviteForm";
import { InvitationRow } from "./InvitationRow";
import { MemberActions } from "./MemberActions";
import { JoinRequestRow } from "./JoinRequestRow";
import { ConversationAccessToggle } from "./ConversationAccessToggle";

const ROLE_LABEL: Record<string, string> = { OWNER: "Owner", ADMIN: "Admin", PHOTOGRAPHER: "Team member", PARTNER: "Partner", CLIENT: "Client" };

export default async function TeamPage() {
  const ctx = await requireRole(["OWNER", "ADMIN"]);
  if (!ctx) redirect("/dashboard");
  const { business } = ctx;

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
  const nextPlan = plan === "FREE" ? "PRO" : plan === "PRO" ? "BUSINESS" : null;

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-8 py-6 md:py-10 dt-stagger">
      <PageHeader
        title="Team"
        description="Your team and partners with access to this business."
        action={<span className="text-xs font-semibold text-ink/55 tabular-nums">{capped ? `${seats} of ${limits.maxTeamSeats}` : `${seats} · unlimited`} <span className="text-ink/40">· {PLANS[plan].name}</span></span>}
      />

      {over && (
        <div role="alert" className="mb-5 rounded-2xl border border-warning/40 bg-warning-soft/60 px-4 py-3 text-sm text-ink/80">
          <span className="font-semibold text-ink">{seats} team members; {PLANS[plan].name} includes {limits.maxTeamSeats}.</span> Everyone keeps access. New invitations are paused until you upgrade or deactivate someone.{nextPlan && <Link href="/dashboard/billing" className="ml-2 font-semibold text-signal-text hover:underline">See plans →</Link>}
        </div>
      )}
      {full && !over && nextPlan && (
        <div className="mb-5 rounded-2xl border border-signal/25 bg-signal-soft/40 px-4 py-3 text-sm text-ink/80 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span><span className="font-semibold text-ink">Team is full.</span> {PLANS[plan].name} includes {limits.maxTeamSeats} team member{limits.maxTeamSeats === 1 ? "" : "s"}{pendingSeats ? ` (${pendingSeats} invitation${pendingSeats === 1 ? "" : "s"} pending)` : ""}. {PLANS[nextPlan].name} includes {limitLabel(PLANS[nextPlan].maxTeamSeats).toLowerCase()}.</span>
          <Link href="/dashboard/billing" className="text-signal-text font-semibold hover:underline">Upgrade →</Link>
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

      <div className="mb-10">
        <SectionLabel hint="a photographer or vendor you hand bookings to">Invite a partner</SectionLabel>
        <PartnerInviteForm />
      </div>

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
