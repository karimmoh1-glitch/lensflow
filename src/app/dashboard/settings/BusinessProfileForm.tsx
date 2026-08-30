"use client";

import { useState, useTransition } from "react";
import { Card, CardBody, Label, Input, Textarea, Select, SaveButton } from "@/components/ui";
import { updateBusinessProfile } from "@/app/actions/settings";
import type { Business } from "@prisma/client";

export function BusinessProfileForm({ business }: { business: Business }) {
  const [name, setName] = useState(business.name);
  const [bio, setBio] = useState(business.bio ?? "");
  const [timezone, setTimezone] = useState(business.timezone);
  const [bufferMinutes, setBufferMinutes] = useState(business.bufferMinutes);
  const [bookingLeadHours, setBookingLeadHours] = useState(business.bookingLeadHours);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  return (
    <Card>
      <CardBody className="space-y-4">
        <div>
          <Label>Business name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <Label>Bio (shown on your booking page)</Label>
          <Textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label>Timezone</Label>
            <Select value={timezone} onChange={(e) => setTimezone(e.target.value)}>
              <option value="America/New_York">Eastern</option>
              <option value="America/Chicago">Central</option>
              <option value="America/Denver">Mountain</option>
              <option value="America/Los_Angeles">Pacific</option>
            </Select>
          </div>
          <div>
            <Label>Buffer (min)</Label>
            <Input type="number" value={bufferMinutes} onChange={(e) => setBufferMinutes(Number(e.target.value))} />
          </div>
          <div>
            <Label>Lead time (hrs)</Label>
            <Input type="number" value={bookingLeadHours} onChange={(e) => setBookingLeadHours(Number(e.target.value))} />
          </div>
        </div>
        <SaveButton
          pending={pending}
          saved={saved}
          onClick={() =>
            startTransition(async () => {
              await updateBusinessProfile({ name, bio, timezone, bufferMinutes, bookingLeadHours });
              setSaved(true);
              setTimeout(() => setSaved(false), 2000);
            })
          }
        >
          Save
        </SaveButton>
      </CardBody>
    </Card>
  );
}
