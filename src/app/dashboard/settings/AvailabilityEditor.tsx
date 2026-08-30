"use client";

import { useState, useTransition } from "react";
import { Card, CardBody, Input, Label, SaveButton } from "@/components/ui";
import { saveAvailability } from "@/app/actions/settings";
import { cn } from "@/lib/utils";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function AvailabilityEditor({ initialWindows }: { initialWindows: { weekday: number; startMin: number; endMin: number }[] }) {
  const [days, setDays] = useState<number[]>(initialWindows.map((w) => w.weekday));
  const [startMin, setStartMin] = useState(initialWindows[0]?.startMin ?? 9 * 60);
  const [endMin, setEndMin] = useState(initialWindows[0]?.endMin ?? 17 * 60);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  const toTime = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
  const fromTime = (v: string) => {
    const [h, m] = v.split(":").map(Number);
    return h * 60 + m;
  };

  return (
    <Card>
      <CardBody className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {DAYS.map((d, i) => (
            <button
              key={d}
              type="button"
              onClick={() => setDays((prev) => (prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]))}
              className={cn(
                "w-11 h-11 rounded-full text-sm font-medium border transition-colors",
                days.includes(i) ? "bg-ink text-white border-ink" : "bg-white border-border hover:border-ink/20"
              )}
            >
              {d}
            </button>
          ))}
        </div>
        <div className="flex gap-4">
          <div className="flex-1">
            <Label>Start time</Label>
            <Input type="time" value={toTime(startMin)} onChange={(e) => setStartMin(fromTime(e.target.value))} />
          </div>
          <div className="flex-1">
            <Label>End time</Label>
            <Input type="time" value={toTime(endMin)} onChange={(e) => setEndMin(fromTime(e.target.value))} />
          </div>
        </div>
        <SaveButton
          pending={pending}
          saved={saved}
          onClick={() =>
            startTransition(async () => {
              await saveAvailability(days.map((weekday) => ({ weekday, startMin, endMin })));
              setSaved(true);
              setTimeout(() => setSaved(false), 2000);
            })
          }
        >
          Save availability
        </SaveButton>
      </CardBody>
    </Card>
  );
}
