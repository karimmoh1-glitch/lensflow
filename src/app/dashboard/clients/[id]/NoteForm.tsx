"use client";

import { useRef } from "react";
import { Button, Textarea } from "@/components/ui";
import { addClientNote } from "@/app/actions/clients";
import { useAction } from "@/components/useAction";

export function NoteForm({ clientId }: { clientId: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const { run, pending } = useAction();

  return (
    <div className="flex gap-2">
      <Textarea ref={ref} rows={1} placeholder="Add a note about this client…" />
      <Button
        size="sm"
        disabled={pending}
        onClick={() => {
          const value = ref.current?.value.trim();
          if (!value) return;
          // The note is only cleared once it is actually saved, so nothing is lost on a failure.
          run(async () => {
            await addClientNote(clientId, value);
            if (ref.current) ref.current.value = "";
          }, { failure: "Couldn't save that note" });
        }}
      >
        Add
      </Button>
    </div>
  );
}
