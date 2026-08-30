"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Sparkles, X, CheckCircle2 } from "lucide-react";
import { Button, Card, CardBody, EmptyState, IconButton } from "@/components/ui";
import { runFixMyDay, type FixMyDayItem } from "@/app/actions/fixMyDay";

export function FixMyDayButton() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<FixMyDayItem[] | null>(null);
  const [pending, startTransition] = useTransition();

  function run() {
    setOpen(true);
    startTransition(async () => {
      const result = await runFixMyDay();
      setItems(result);
    });
  }

  return (
    <>
      <Button variant="secondary" size="lg" onClick={run}>
        <Sparkles className="w-4 h-4" strokeWidth={2} />
        Fix my day
      </Button>

      {open && (
        <div className="fixed inset-0 bg-black/30 flex items-start justify-center pt-24 px-4 z-50" onClick={() => setOpen(false)}>
          <div className="w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <Card className="shadow-popover">
              <CardBody className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-display text-section-title">Today's priorities</h2>
                  <IconButton aria-label="Close" onClick={() => setOpen(false)}>
                    <X className="w-4 h-4" strokeWidth={2} />
                  </IconButton>
                </div>

                {pending && (
                  <div className="space-y-2 animate-pulse" aria-live="polite" aria-label="Loading">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="h-11 rounded-lg bg-black/[0.04]" />
                    ))}
                  </div>
                )}

                {!pending && items && items.length === 0 && (
                  <EmptyState
                    title="You're all caught up"
                    description="Nothing needs your attention right now."
                    action={
                      <div className="flex items-center gap-1.5 text-success-text text-sm">
                        <CheckCircle2 className="w-4 h-4" strokeWidth={2} />
                        All clear
                      </div>
                    }
                  />
                )}

                {!pending && items && items.length > 0 && (
                  <>
                    <p className="text-sm text-ink/55 mb-4">
                      {items.length} thing{items.length > 1 ? "s" : ""} need{items.length === 1 ? "s" : ""} attention:
                    </p>
                    <ol className="space-y-2">
                      {items.map((item) => (
                        <li key={item.id} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
                          <span className="text-sm">{item.title}</span>
                          <Link href={item.href} onClick={() => setOpen(false)}>
                            <Button size="sm" variant="outline">
                              {item.actionLabel}
                            </Button>
                          </Link>
                        </li>
                      ))}
                    </ol>
                  </>
                )}
              </CardBody>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
