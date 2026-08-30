import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHeader, Card, Badge } from "@/components/ui";
import { initials } from "@/lib/utils";
import { format } from "date-fns";
import { PartnerInviteForm } from "./PartnerInviteForm";
import { InvitationRow } from "./InvitationRow";
import { MemberActions } from "./MemberActions";
import { JoinRequestRow } from "./JoinRequestRow";
import { ConversationAccessToggle } from "./ConversationAccessToggle";

const ROLE_LABEL: Record<string, string> = { OWNER: "Owner", ADMIN: "Admin", PHOTOGRAPHER: "Photographer", PARTNER: "Partner", CLIENT: "Client" };

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

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-8 py-6 md:py-10">
      <PageHeader title="Team" description="Photographers and partners with access to this studio." />

      <div className="mb-10">
        <h2 className="text-sm font-medium text-ink mb-2.5">Members</h2>
        <Card>
          <div className="divide-y divide-border">
            {members.map((m) => (
              <div key={m.id} className="flex items-center gap-3 px-4 py-3.5">
                <div className="w-8 h-8 rounded-full bg-accent-soft text-accent-text flex items-center justify-center text-xs font-semibold shrink-0">
                  {initials(m.user.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">
                    {m.user.name}
                    {m.status === "SUSPENDED" && <span className="text-danger-text font-normal"> · Deactivated</span>}
                  </div>
                  <div className="text-xs text-ink/45 truncate">
                    {m.user.email}
                    {m.role === "PARTNER" &&
                      ` · ${m.assignedBookings.length} upcoming ${m.assignedBookings.length === 1 ? "project" : "projects"}`}
                  </div>
                </div>
                {m.role === "PARTNER" && <ConversationAccessToggle membershipId={m.id} canViewAll={m.canViewAllConversations} />}
                <Badge tone={m.role === "OWNER" ? "accent" : "neutral"}>{ROLE_LABEL[m.role]}</Badge>
                <MemberActions membershipId={m.id} role={m.role} status={m.status} />
              </div>
            ))}
          </div>
        </Card>
      </div>

      {joinRequests.length > 0 && (
        <div className="mb-10">
          <h2 className="text-sm font-medium text-ink mb-2.5">Join requests</h2>
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
        <h2 className="text-sm font-medium text-ink mb-2.5">Invite a partner</h2>
        <PartnerInviteForm />
      </div>

      {invitations.length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-ink mb-2.5">Invitations</h2>
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
