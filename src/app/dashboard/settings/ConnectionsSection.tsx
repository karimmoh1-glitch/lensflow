import { prisma } from "@/lib/db";
import { Card, Badge } from "@/components/ui";
import { stripeIsLive } from "@/lib/payments";
import { aiEnabled } from "@/lib/ai";
import { getAllChannelAdapters } from "@/lib/channels/registry";
import { IntegrationToggle } from "../integrations/IntegrationToggle";
import { SimulateInbound } from "../integrations/SimulateInbound";
import type { IntegrationProvider } from "@prisma/client";
import Link from "next/link";

const CHANNEL_LABEL: Record<string, string> = {
  EMAIL: "Email",
  SMS: "SMS",
  INSTAGRAM: "Instagram",
  WHATSAPP: "WhatsApp",
  PHONE: "Phone",
  WEBSITE: "Website lead form",
};

export async function ConnectionsSection({ businessId, handle }: { businessId: string; handle: string }) {
  const integrations = await prisma.integration.findMany({ where: { businessId } });
  const byProvider = new Map(integrations.map((i) => [i.provider, i]));
  const adapters = getAllChannelAdapters();

  const anyLive = adapters.some((a) => a.capabilities().live) || stripeIsLive;

  return (
    <div className="space-y-8">
      {!aiEnabled && (
        <p className="text-sm text-ink/50 bg-black/[0.03] rounded-md px-3.5 py-2.5">
          No AI provider key is configured — lead extraction, reply drafts, and the copilot run on a rule-based fallback instead of a
          language model. Add <code className="text-xs bg-black/[0.05] px-1 rounded">OPENAI_API_KEY</code> to enable full AI.
        </p>
      )}

      <div>
        <Card>
          <div className="divide-y divide-border">
            {adapters.map((adapter) => {
              const caps = adapter.capabilities();
              const provider = adapter.channel as IntegrationProvider;
              const integration = byProvider.get(provider);
              const status = integration?.status ?? "NOT_CONNECTED";
              const isWebsite = adapter.channel === "WEBSITE";

              return (
                <div key={adapter.channel} className="flex items-center justify-between gap-4 px-4 py-3.5">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{CHANNEL_LABEL[adapter.channel]}</div>
                    <div className="text-xs text-ink/50 mt-0.5">{caps.setupNote}</div>
                    {isWebsite && (
                      <Link href={`/embed/${handle}`} target="_blank" className="text-xs text-accent-text hover:underline mt-1 inline-block">
                        View embeddable form →
                      </Link>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {caps.live ? (
                      <Badge tone="success">Live</Badge>
                    ) : status !== "NOT_CONNECTED" && caps.canReceive ? (
                      <Badge tone="warning">Demo mode</Badge>
                    ) : !caps.canSend && !caps.canReceive ? (
                      <Badge tone="neutral">Needs setup</Badge>
                    ) : null}
                    {!isWebsite && <IntegrationToggle provider={provider} connected={status !== "NOT_CONNECTED"} />}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
        {!anyLive && (
          <p className="text-xs text-ink/40 mt-2">
            Every channel above is in demo mode until real credentials are added — outbound messages log to the console instead of
            sending, and nothing is ever shown as "Connected" unless it actually is.
          </p>
        )}
      </div>

      <div>
        <h3 className="text-sm font-medium text-ink mb-1">Simulate an inbound message</h3>
        <p className="text-xs text-ink/45 mb-3">See lead extraction, scoring, and inbox routing run end-to-end without a live connection.</p>
        <SimulateInbound />
      </div>
    </div>
  );
}
