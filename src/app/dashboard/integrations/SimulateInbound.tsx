"use client";

import { useState, useTransition } from "react";
import { Card, CardBody, Button, Input, Textarea, Select, Label } from "@/components/ui";
import { simulateInboundMessage } from "@/app/actions/integrations";
import type { ChannelType } from "@prisma/client";

export function SimulateInbound() {
  const [channel, setChannel] = useState<ChannelType>("INSTAGRAM");
  const [senderName, setSenderName] = useState("Jamie Chen");
  const [handle, setHandle] = useState("@jamie.chen");
  const [body, setBody] = useState("Hi! Do you have any openings for a graduation shoot on June 14th? Excited to work with you!");
  const [pending, startTransition] = useTransition();

  return (
    <Card>
      <CardBody className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Channel</Label>
            <Select value={channel} onChange={(e) => setChannel(e.target.value as ChannelType)}>
              <option value="INSTAGRAM">Instagram</option>
              <option value="EMAIL">Email</option>
              <option value="SMS">SMS</option>
              <option value="WHATSAPP">WhatsApp</option>
              <option value="WEBSITE">Website</option>
            </Select>
          </div>
          <div>
            <Label>Sender name</Label>
            <Input value={senderName} onChange={(e) => setSenderName(e.target.value)} />
          </div>
        </div>
        <div>
          <Label>Handle / contact</Label>
          <Input value={handle} onChange={(e) => setHandle(e.target.value)} />
        </div>
        <div>
          <Label>Message</Label>
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} />
        </div>
        <Button
          disabled={pending}
          onClick={() =>
            startTransition(() => {
              simulateInboundMessage({ channel, senderName, handle, body });
            })
          }
        >
          {pending ? "Sending…" : "Send simulated message"}
        </Button>
      </CardBody>
    </Card>
  );
}
