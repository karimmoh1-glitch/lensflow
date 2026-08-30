import { notFound } from "next/navigation";
import { previewInvitation } from "@/app/actions/invitations";
import { Card, CardBody } from "@/components/ui";
import { initials } from "@/lib/utils";
import { AcceptInviteForm } from "./AcceptInviteForm";

const ROLE_COPY: Record<string, { title: string; body: string }> = {
  CLIENT: {
    title: "You've been invited",
    body: "You'll be able to see your bookings, payments, and project details in one place.",
  },
  PARTNER: {
    title: "You've been invited to join the team",
    body: "You'll get access to the bookings and projects assigned to you.",
  },
  ADMIN: { title: "You've been invited to join the team", body: "You'll have full access to manage this studio." },
  PHOTOGRAPHER: { title: "You've been invited to join the team", body: "You'll be able to manage bookings, clients, and payments." },
};

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invitation = await previewInvitation(token);
  if (!invitation) notFound();

  if (invitation.status !== "PENDING") {
    const message: Record<string, string> = {
      ACCEPTED: "This invitation has already been used.",
      EXPIRED: "This invitation has expired. Ask the studio to send you a new one.",
      REVOKED: "This invitation has been revoked.",
      INVALID: "This invitation link isn't valid.",
    };
    return (
      <main className="min-h-screen bg-paper flex items-center justify-center px-6">
        <Card className="w-full max-w-sm">
          <CardBody className="p-8 text-center">
            <h1 className="font-display text-xl mb-2">Invitation unavailable</h1>
            <p className="text-sm text-ink/55">{message[invitation.status]}</p>
          </CardBody>
        </Card>
      </main>
    );
  }

  const copy = ROLE_COPY[invitation.role] ?? ROLE_COPY.PARTNER;

  return (
    <main className="min-h-screen bg-paper flex items-center justify-center px-6">
      <Card className="w-full max-w-sm">
        <CardBody className="p-8">
          <div className="flex flex-col items-center text-center mb-6">
            <div className="w-14 h-14 rounded-full bg-accent-soft text-accent-text flex items-center justify-center text-lg font-semibold mb-3">
              {initials(invitation.businessName)}
            </div>
            <p className="text-xs text-ink/45 mb-1">Invited by</p>
            <h1 className="font-display text-lg mb-3">{invitation.businessName}</h1>
            <p className="text-sm font-medium text-ink">{copy.title}</p>
            <p className="text-sm text-ink/55 mt-1">{copy.body}</p>
          </div>

          <AcceptInviteForm token={token} email={invitation.email} existingAccount={invitation.existingAccount} />
        </CardBody>
      </Card>
    </main>
  );
}
