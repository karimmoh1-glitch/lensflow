"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardBody, Select, Label } from "@/components/ui";
import { assignPartner } from "@/app/actions/bookings";

export function AssignPartner({
  bookingId,
  partners,
  assignedMembershipId,
}: {
  bookingId: string;
  partners: { id: string; name: string }[];
  assignedMembershipId: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <Card>
      <CardBody>
        <Label htmlFor="assign-partner">Assigned partner</Label>
        <Select
          id="assign-partner"
          disabled={pending}
          defaultValue={assignedMembershipId ?? ""}
          onChange={(e) =>
            startTransition(async () => {
              await assignPartner(bookingId, e.target.value || null);
              router.refresh();
            })
          }
        >
          <option value="">Unassigned</option>
          {partners.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <p className="text-xs text-ink/60 mt-1.5">Only the assigned partner can see this booking in their portal.</p>
      </CardBody>
    </Card>
  );
}
