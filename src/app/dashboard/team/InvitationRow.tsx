"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, IconButton } from "@/components/ui";
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

  const link = typeof window !== "undefined" ? `${window.location.origin}/invite/${token}` : `/invite/${token}`;

  return (
    <div className="flex items-center gap-3 px-4 py-3 text-sm">
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{email}</div>
        <div className="text-xs text-ink/65">
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
            onClick={() => startTransition(async () => { await resendInvitation(id); router.refresh(); })}
          >
            <RotateCcw className={cn("w-4 h-4", pending && "animate-spin")} strokeWidth={2} />
          </IconButton>
          <IconButton
            aria-label="Revoke invitation"
            disabled={pending}
            className="hover:text-danger"
            onClick={() => startTransition(async () => { await revokeInvitation(id); router.refresh(); })}
          >
            <Ban className="w-4 h-4" strokeWidth={2} />
          </IconButton>
        </div>
      )}
    </div>
  );
}
