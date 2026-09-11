"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, IconButton } from "@/components/ui";
import { useToast } from "@/components/Toaster";
import { revokeInvitation, resendInvitation } from "@/app/actions/invitations";
import { Copy, RotateCcw, Ban, Check } from "lucide-react";
import { cn } from "@/lib/utils";

const STATUS_TONE: Record<string, "neutral" | "success" | "warning" | "danger"> = {
  PENDING: "warning",
  ACCEPTED: "success",
  EXPIRED: "neutral",
  REVOKED: "danger",
};

export function InvitationRow({
  id,
  email,
  role,
  status,
  createdAt,
  token,
}: {
  id: string;
  email: string;
  role: string;
  status: string;
  createdAt: string;
  token: string;
}) {
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const link = typeof window !== "undefined" ? `${window.location.origin}/invite/${token}` : `/invite/${token}`;

  return (
    <div className="flex items-center gap-3 px-4 py-3 text-sm">
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{email}</div>
        <div className="text-xs text-ink/70">
          {role} · sent {createdAt}
        </div>
      </div>
      <Badge tone={STATUS_TONE[status] ?? "neutral"}>{status.toLowerCase()}</Badge>
      {status === "PENDING" && (
        <div className="flex items-center gap-1">
          <IconButton
            aria-label={copied ? "Copied" : "Copy invitation link"}
            onClick={() => {
              navigator.clipboard.writeText(link);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? <Check className="w-4 h-4" strokeWidth={2} /> : <Copy className="w-4 h-4" strokeWidth={2} />}
          </IconButton>
          <IconButton
            aria-label="Resend invitation"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                // Resending mints a new token, so the row must refresh either way — but the
                // person pressing this needs to know whether an email actually went out.
                const result = await resendInvitation(id);
                router.refresh();
                if (result.error) toast({ tone: "signal", title: "Couldn't resend", body: result.error });
                else if (result.delivery?.emailed) toast({ tone: "outcome", title: `Invitation resent to ${email}` });
                else toast({ tone: "signal", title: "Nothing was emailed", body: `${result.delivery?.note ?? "Email isn't switched on yet."} Copy the link and send it yourself.` });
              })
            }
          >
            <RotateCcw className={cn("w-4 h-4", pending && "animate-spin")} strokeWidth={2} />
          </IconButton>
          <IconButton
            aria-label="Revoke invitation"
            disabled={pending}
            className="hover:text-danger"
            onClick={() =>
              startTransition(async () => {
                const result = await revokeInvitation(id);
                router.refresh();
                if (result.error) toast({ tone: "signal", title: "Couldn't revoke", body: result.error });
              })
            }
          >
            <Ban className="w-4 h-4" strokeWidth={2} />
          </IconButton>
        </div>
      )}
    </div>
  );
}
