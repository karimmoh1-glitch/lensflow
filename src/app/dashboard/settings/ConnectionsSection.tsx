import { prisma } from "@/lib/db";
import { Card, Badge } from "@/components/ui";
import { stripeIsLive } from "@/lib/payments";
import { aiEnabled } from "@/lib/ai";
import { getAllChannelAdapters } from "@/lib/channels/registry";
import { IntegrationToggle } from "../integrations/IntegrationToggle";
import { SimulateInbound } from "../integrations/SimulateInbound";
import { GoogleConnectButton, GmailConnectedControls } from "./GmailControls";
import { googleOAuthConfigured } from "@/lib/google";
import type { Business, IntegrationProvider } from "@prisma/client";
import Link from "next/link";

const CHANNEL_LABEL: Record<string, string> = {
  EMAIL: "Email",
  SMS: "SMS",
  INSTAGRAM: "Instagram",
  WHATSAPP: "WhatsApp",
  PHONE: "Phone",
  WEBSITE: "Website lead form",
};

const CALENDAR_PROVIDERS = [
  { key: "google", label: "Google Calendar", note: "Requires Google Cloud OAuth credentials and the Calendar API — not built yet." },
  { key: "microsoft", label: "Microsoft Calendar", note: "Requires a Microsoft Entra app registration and Graph API access — not built yet." },
  { key: "apple", label: "Apple Calendar", note: "Requires CalDAV support — not built yet." },
];

function Row({
  label,
  note,
  badge,
  action,
}: {
  label: string;
  note: React.ReactNode;
  badge: { tone: "success" | "warning" | "neutral"; label: string };
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3.5">
      <div className="min-w-0">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-ink/50 mt-0.5">{note}</div>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <Badge tone={badge.tone}>{badge.label}</Badge>
        {action}
      </div>
    </div>
  );
}

export async function ConnectionsSection({
  business,
  googleConnected,
  googleError,
}: {
  business: Business;
  googleConnected?: boolean;
  googleError?: string;
}) {
  const integrations = await prisma.integration.findMany({ where: { businessId: business.id } });
  const byProvider = new Map(integrations.map((i) => [i.provider, i]));
  const adapters = getAllChannelAdapters();
  const gmailIntegration = byProvider.get("EMAIL");
  const gmailConnected = Boolean(gmailIntegration?.refreshToken);

  const anyLive = adapters.some((a) => a.capabilities().live) || stripeIsLive || gmailConnected;

  const GOOGLE_ERROR_COPY: Record<string, string> = {
    denied: "Google sign-in was cancelled before it finished.",
    no_refresh_token: "Google didn't return a long-lived connection. Try connecting again — if it keeps happening, revoke Daythread's access at myaccount.google.com/permissions and reconnect.",
    expired: "That connection attempt expired. Try again.",
    error: "Something went wrong connecting to Google. Try again.",
  };

  const zelleConfigured = business.paymentMethods.includes("zelle") && !!business.zelleHandle;
  const bankConfigured = business.paymentMethods.includes("bank_transfer") && !!business.bankInstructions;

  return (
    <div className="space-y-8">
      {googleConnected && (
        <p className="text-sm text-success bg-success/10 rounded-md px-3.5 py-2.5">
          Gmail connected — {gmailIntegration?.externalAccount}. New messages will show up in your Inbox once you hit "Check for new
          emails," and replies now send from your real Gmail account.
        </p>
      )}
      {googleError && (
        <p className="text-sm text-danger bg-danger/10 rounded-md px-3.5 py-2.5">{GOOGLE_ERROR_COPY[googleError] ?? GOOGLE_ERROR_COPY.error}</p>
      )}
      {!aiEnabled && (
        <p className="text-sm text-ink/50 bg-black/[0.03] rounded-md px-3.5 py-2.5">
          No AI provider key is configured — lead extraction, reply drafts, and the copilot run on a rule-based fallback instead of a
          language model. Add <code className="text-xs bg-black/[0.05] px-1 rounded">OPENAI_API_KEY</code> to enable full AI.
        </p>
      )}

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-ink/40 mb-2">Communication</h3>
        <Card>
          <div className="divide-y divide-border">
            {adapters.map((adapter) => {
              const caps = adapter.capabilities();
              const provider = adapter.channel as IntegrationProvider;
              const integration = byProvider.get(provider);
              const status = integration?.status ?? "NOT_CONNECTED";
              const isWebsite = adapter.channel === "WEBSITE";
              const isEmail = adapter.channel === "EMAIL";
              // Instagram/WhatsApp/Phone have no demo capability at all (no real send or
              // receive path exists yet) — toggling them wouldn't demonstrate anything, so
              // there's no toggle to show, only the honest "needs setup" state.
              const canDemo = caps.canSend || caps.canReceive;

              // Email's real state now comes from a per-business Gmail OAuth connection
              // first (each photographer connects their own inbox), falling back to the
              // platform-wide Resend path if that's configured instead. Never a fake
              // per-business "Connect" toggle — the badge always reflects one of these
              // two genuinely-checkable states, or neither.
              let emailBadge: { tone: "success" | "warning" | "neutral"; label: string };
              let emailNote: React.ReactNode;
              let emailAction: React.ReactNode;

              if (gmailConnected) {
                emailBadge = { tone: "success", label: "✓ Gmail Connected" };
                emailNote = `${gmailIntegration!.externalAccount} — incoming email lands in your Inbox, replies send from this account.`;
                emailAction = <GmailConnectedControls />;
              } else if (googleOAuthConfigured()) {
                emailBadge = { tone: "neutral", label: "Needs setup" };
                emailNote = "Connect your Gmail account to send and receive messages right from your Daythread inbox.";
                emailAction = <GoogleConnectButton />;
              } else if (caps.live) {
                emailBadge = { tone: "success", label: "✓ Email Connected" };
                emailNote = "Sending and receiving live.";
                emailAction = undefined;
              } else if (caps.canSend) {
                emailBadge = { tone: "warning", label: "Configuration required" };
                emailNote = "Sending is ready. One more step is needed before incoming email reaches your inbox.";
                emailAction = undefined;
              } else {
                emailBadge = { tone: "neutral", label: "Needs setup" };
                emailNote = "Connect your business email to send and receive messages right from your Daythread inbox.";
                emailAction = undefined;
              }

              const badge = isEmail ? emailBadge : caps.live
                ? ({ tone: "success", label: "✓ Connected" } as const)
                : status !== "NOT_CONNECTED" && canDemo
                  ? ({ tone: "warning", label: "Demo mode" } as const)
                  : ({ tone: "neutral", label: "Needs setup" } as const);

              return (
                <Row
                  key={adapter.channel}
                  label={CHANNEL_LABEL[adapter.channel]}
                  note={
                    isWebsite ? (
                      <>
                        {caps.setupNote}{" "}
                        <Link href={`/embed/${business.handle}`} target="_blank" className="text-accent-text hover:underline">
                          View embeddable form →
                        </Link>
                      </>
                    ) : isEmail ? (
                      emailNote
                    ) : (
                      caps.setupNote
                    )
                  }
                  badge={badge}
                  action={
                    isEmail
                      ? emailAction
                      : !isWebsite && canDemo
                        ? <IntegrationToggle provider={provider} connected={status !== "NOT_CONNECTED"} />
                        : undefined
                  }
                />
              );
            })}
          </div>
        </Card>
      </div>

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-ink/40 mb-2">Calendar</h3>
        <Card>
          <div className="divide-y divide-border">
            {CALENDAR_PROVIDERS.map((c) => (
              <Row key={c.key} label={c.label} note={c.note} badge={{ tone: "neutral", label: "Needs setup" }} />
            ))}
          </div>
        </Card>
      </div>

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-ink/40 mb-2">Payments</h3>
        <Card>
          <div className="divide-y divide-border">
            <Row
              label="Stripe"
              note={stripeIsLive ? "Real card checkout is live." : "Add STRIPE_SECRET_KEY to accept real card payments — falls back to a simulated checkout until then."}
              badge={stripeIsLive ? { tone: "success", label: "✓ Connected" } : { tone: "neutral", label: "Needs setup" }}
            />
            <Row
              label="Zelle"
              note={
                zelleConfigured
                  ? `Payments sent to ${business.zelleHandle}. You confirm each one manually once received.`
                  : "Not a real-time connection — Zelle has no API. Set your handle in the Payments tab, then confirm each payment manually when it arrives."
              }
              badge={zelleConfigured ? { tone: "warning", label: "Tracked manually" } : { tone: "neutral", label: "Needs setup" }}
            />
            <Row
              label="Bank transfer"
              note={bankConfigured ? "Instructions are set — confirm each transfer manually once received." : "Add your bank instructions in the Payments tab."}
              badge={bankConfigured ? { tone: "warning", label: "Tracked manually" } : { tone: "neutral", label: "Needs setup" }}
            />
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
