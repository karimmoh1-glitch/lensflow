import { notFound } from "next/navigation";
import Link from "next/link";
import { previewInvitation } from "@/app/actions/invitations";
import { AuthShell } from "@/components/auth/AuthShell";
import { AcceptInviteForm } from "./AcceptInviteForm";

const ROLE_COPY: Record<string, string> = {
  ADMIN: "You'll share the inbox with full access to its settings.",
  PHOTOGRAPHER: "You'll share the inbox: read every conversation, reply, and take the threads assigned to you.",
  PARTNER: "You'll share the inbox: read every conversation, reply, and take the threads assigned to you.",
  CLIENT: "This invitation is from an older version of Daythread and can't be used any more.",
};

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invitation = await previewInvitation(token);
  if (!invitation) notFound();

  if (invitation.status !== "PENDING") {
    const message: Record<string, string> = {
      ACCEPTED: "This invitation has already been used.",
      EXPIRED: "This invitation has expired. Ask them to send a new one.",
      REVOKED: "This invitation was revoked.",
      INVALID: "This invitation link isn't valid.",
    };
    return (
      <AuthShell eyebrow="Invitation" title="This link won't work anymore." lede={message[invitation.status]}>
        <Link href="/login" className="text-sm font-semibold text-ink hover:text-accent-text transition-colors">
          Go to log in →
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      eyebrow={`${invitation.businessName} invited you`}
      title={`Join ${invitation.businessName}.`}
      lede={ROLE_COPY[invitation.role] ?? ROLE_COPY.PHOTOGRAPHER}
    >
      <AcceptInviteForm token={token} email={invitation.email} existingAccount={invitation.existingAccount} />
    </AuthShell>
  );
}
