"use client";

import { useState } from "react";
import { Card, CardBody, Select, Label } from "@/components/ui";
import { assignPartner } from "@/app/actions/bookings";
import { useAction } from "@/components/useAction";

export function AssignPartner({
  bookingId,
  partners,
  assignedMembershipId,
}: {
  bookingId: string;
  partners: { id: string; name: string }[];
  assignedMembershipId: string | null;
}) {
  // The select is optimistic, so a refused change has to put it back rather than leave the
  // page claiming an assignment that never happened.
  const [value, setValue] = useState(assignedMembershipId ?? "");
  const { run, pending } = useAction();

  return (
    <Card>
      <CardBody>
        <Label htmlFor="assign-partner">Assigned partner</Label>
        <Select
          id="assign-partner"
          disabled={pending}
          value={value}
          onChange={(e) => {
            const next = e.target.value;
            const previous = value;
            setValue(next);
            run(() => assignPartner(bookingId, next || null), { failure: "Couldn't assign that partner", onError: () => setValue(previous) });
          }}
        >
          <option value="">Unassigned</option>
          {partners.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <p className="text-xs text-ink/65 mt-1.5">Only the assigned partner can see this booking in their portal.</p>
      </CardBody>
    </Card>
  );
}
