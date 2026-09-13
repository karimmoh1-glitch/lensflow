"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, Copy, Check } from "lucide-react";
import { Button, Input, Label } from "@/components/ui";
import { Dialog } from "@/components/Dialog";
import { inviteClient } from "@/app/actions/invitations";

export function InviteClientButton() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [emailed, setEmailed] = useState(false);
  const [note, setNote] = useState("");
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function close() {
    setOpen(false);
    setLink(null);
    setError(null);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await inviteClient(formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      setLink(result.link ?? null);
      setEmailed(result.delivery?.emailed ?? false);
      setNote(result.delivery?.note ?? "");
      router.refresh();
    });
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <UserPlus className="w-3.5 h-3.5" strokeWidth={2} />
        Invite client
      </Button>

      <Dialog open={open} onClose={close} title={link ? "Invitation ready" : "Invite a client"}>
        {!link ? (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <Label htmlFor="client-name">Name</Label>
              <Input id="client-name" name="name" placeholder="Sarah Johnson" required />
            </div>
            <div>
              <Label htmlFor="client-email">Email</Label>
              <Input id="client-email" name="email" type="email" placeholder="sarah@example.com" required />
            </div>
            <div>
              <Label htmlFor="client-phone">Phone (optional)</Label>
              <Input id="client-phone" name="phone" type="tel" placeholder="(555) 123-4567" />
            </div>
            {error && <p className="text-sm text-danger">{error}</p>}
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "Sending…" : "Invite client"}
            </Button>
          </form>
        ) : (
          <div>
            <p className="text-sm text-ink/75 mb-3">
              {emailed
                ? "We\u2019ve emailed them the link. They\u2019ll be able to see their bookings and messages once they accept."
                : `${note} Send them this link yourself \u2014 they\u2019ll be able to see their bookings and messages once they accept.`}
            </p>
            <div className="flex items-center gap-2">
              <Input value={link} readOnly className="text-xs" />
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
          </div>
        )}
      </Dialog>
    </>
  );
}
