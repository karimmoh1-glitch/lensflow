"use client";

import { useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Textarea } from "@/components/ui";
import { addClientNote } from "@/app/actions/clients";

export function NoteForm({ clientId }: { clientId: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <div className="flex gap-2">
      <Textarea ref={ref} rows={1} placeholder="Add a note about this client…" />
      <Button
        size="sm"
        disabled={pending}
        onClick={() => {
          const value = ref.current?.value.trim();
          if (!value) return;
          startTransition(async () => {
            await addClientNote(clientId, value);
            if (ref.current) ref.current.value = "";
            router.refresh();
          });
        }}
      >
        Add
      </Button>
    </div>
  );
}
