"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, X, Copy, Check } from "lucide-react";
import { Button, Card, CardBody, Input, Label, IconButton } from "@/components/ui";
import { inviteClient } from "@/app/actions/invitations";

export function InviteClientButton() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
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
      router.refresh();
    });
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <UserPlus className="w-3.5 h-3.5" strokeWidth={2} />
        Invite client
      </Button>

      {open && (
        <div className="fixed inset-0 bg-black/30 flex items-start justify-center pt-24 px-4 z-50" onClick={close}>
          <div className="w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <Card className="shadow-popover">
              <CardBody className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-display text-section-title">{link ? "Invitation ready" : "Invite a client"}</h2>
                  <IconButton aria-label="Close" onClick={close}>
                    <X className="w-4 h-4" strokeWidth={2} />
                  </IconButton>
                </div>

                {!link ? (
                  <form ref={formRef} onSubmit={handleSubmit} className="space-y-3">
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
                    <p className="text-sm text-ink/55 mb-3">
                      They&apos;ll be able to see their bookings, payments, and files once they accept.
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
              </CardBody>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
