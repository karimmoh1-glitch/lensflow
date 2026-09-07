"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardBody, Input, Label, Button } from "@/components/ui";
import { inviteTeammate } from "@/app/actions/invitations";
import { Check, Copy } from "lucide-react";

export function TeamInviteForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await inviteTeammate(formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      setLink(result.link ?? null);
      formRef.current?.reset();
      router.refresh();
    });
  }

  if (link) {
    return (
      <Card>
        <CardBody>
          <p className="text-sm font-medium mb-1">Invitation sent</p>
          <p className="text-xs text-ink/70 mb-3">They&rsquo;ll get it by email. You can also share the link directly.</p>
          <div className="flex items-center gap-2">
            <Input value={link} readOnly className="text-xs" aria-label="Invitation link" />
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                navigator.clipboard.writeText(link);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? <Check className="w-3.5 h-3.5" strokeWidth={2} /> : <Copy className="w-3.5 h-3.5" strokeWidth={2} />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <button type="button" className="text-xs text-accent-text font-medium mt-3" onClick={() => setLink(null)}>
            Invite another
          </button>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardBody>
        <form ref={formRef} onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 sm:items-end" noValidate>
          <div className="flex-1">
            <Label htmlFor="teammate-name">Name</Label>
            <Input id="teammate-name" name="name" placeholder="Jordan Lee" autoComplete="off" required />
          </div>
          <div className="flex-1">
            <Label htmlFor="teammate-email">Email</Label>
            <Input id="teammate-email" name="email" type="email" inputMode="email" placeholder="jordan@example.com" autoComplete="off" required />
          </div>
          <Button type="submit" loading={pending} loadingLabel="Sending">Invite</Button>
        </form>
        {error && <p role="alert" className="text-sm text-danger-text mt-2">{error}</p>}
      </CardBody>
    </Card>
  );
}
