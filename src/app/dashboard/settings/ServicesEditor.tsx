"use client";

import { useState, useTransition } from "react";
import { Plus, X } from "lucide-react";
import { Card, CardBody, Input, Button, Label, SaveButton, IconButton } from "@/components/ui";
import { saveServices } from "@/app/actions/settings";

type Svc = { id?: string; name: string; priceCents: number; durationMins: number };

export function ServicesEditor({ initialServices }: { initialServices: Svc[] }) {
  const [services, setServices] = useState<Svc[]>(initialServices);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  return (
    <Card>
      <CardBody className="space-y-3">
        {services.map((svc, i) => (
          <div key={i} className="flex gap-2 items-end">
            <div className="flex-1">
              <Label>Service</Label>
              <Input value={svc.name} onChange={(e) => setServices((prev) => prev.map((p, idx) => (idx === i ? { ...p, name: e.target.value } : p)))} />
            </div>
            <div className="w-28">
              <Label>Price $</Label>
              <Input
                type="number"
                value={svc.priceCents / 100}
                onChange={(e) => setServices((prev) => prev.map((p, idx) => (idx === i ? { ...p, priceCents: Math.round(Number(e.target.value) * 100) } : p)))}
              />
            </div>
            <div className="w-24">
              <Label>Mins</Label>
              <Input
                type="number"
                value={svc.durationMins}
                onChange={(e) => setServices((prev) => prev.map((p, idx) => (idx === i ? { ...p, durationMins: Number(e.target.value) } : p)))}
              />
            </div>
            <IconButton aria-label="Remove service" onClick={() => setServices((prev) => prev.filter((_, idx) => idx !== i))}>
              <X className="w-4 h-4" strokeWidth={2} />
            </IconButton>
          </div>
        ))}
        <div className="flex items-center gap-2 pt-1">
          <Button variant="outline" size="sm" onClick={() => setServices((prev) => [...prev, { name: "New Service", priceCents: 20000, durationMins: 60 }])}>
            <Plus className="w-3.5 h-3.5" strokeWidth={2} />
            Add service
          </Button>
          <SaveButton
            pending={pending}
            saved={saved}
            onClick={() =>
              startTransition(async () => {
                await saveServices(services);
                setSaved(true);
                setTimeout(() => setSaved(false), 2000);
              })
            }
          >
            Save services
          </SaveButton>
        </div>
      </CardBody>
    </Card>
  );
}
