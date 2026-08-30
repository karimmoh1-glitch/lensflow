import { redirect } from "next/navigation";
import { requireClientRecord } from "@/app/actions/portal";
import { prisma } from "@/lib/db";
import { PageHeader, Card, Badge, EmptyState } from "@/components/ui";
import { formatMoney, toZonedDisplayDate } from "@/lib/utils";
import { format } from "date-fns";
import { PayButton } from "./PayButton";
import { PortalMessages } from "./PortalMessages";
import { ExternalLink } from "lucide-react";

const STATUS_TONE: Record<string, "neutral" | "success" | "warning" | "info" | "danger"> = {
  INQUIRY: "neutral",
  BOOKED: "info",
  DEPOSIT_PAID: "warning",
  CONFIRMED: "success",
  QUESTIONNAIRE_COMPLETE: "success",
  UPCOMING: "success",
  COMPLETED: "neutral",
  BALANCE_PAID: "success",
  FOLLOWED_UP: "neutral",
  CANCELED: "danger",
};

export default async function PortalHomePage() {
  const ctx = await requireClientRecord();
  if (!ctx) redirect("/login");
  const { client, business } = ctx;

  const [bookings, payments, conversation] = await Promise.all([
    prisma.booking.findMany({
      where: { clientId: client.id, businessId: business.id },
      include: { service: true, payments: true },
      orderBy: { startAt: "desc" },
    }),
    prisma.payment.findMany({ where: { clientId: client.id, businessId: business.id }, orderBy: { createdAt: "desc" } }),
    prisma.conversation.findFirst({
      where: { clientId: client.id, businessId: business.id },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    }),
  ]);

  const outstanding = payments.filter((p) => p.status === "AWAITING_CONFIRMATION");
  const upcoming = bookings.filter((b) => b.status !== "CANCELED" && b.status !== "COMPLETED" && b.status !== "FOLLOWED_UP" && b.status !== "BALANCE_PAID");
  const past = bookings.filter((b) => !upcoming.includes(b));

  return (
    <div className="max-w-2xl mx-auto px-4 md:px-8 py-8 md:py-10">
      <PageHeader title={`Welcome, ${client.name.split(" ")[0]}`} description={`Your projects with ${business.name}`} />

      {outstanding.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-medium text-ink mb-2.5">Payment due</h2>
          <Card>
            <div className="divide-y divide-border">
              {outstanding.map((p) => (
                <div key={p.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3.5">
                  <div>
                    <div className="text-sm font-medium">
                      {p.purpose === "DEPOSIT" ? "Deposit" : "Balance"} — {formatMoney(p.amountCents)}
                    </div>
                    {p.method !== "CARD" ? (
                      <div className="text-xs text-ink/50 mt-1">
                        {p.method === "ZELLE" ? (
                          <>
                            Send via Zelle to <span className="font-medium">{business.zelleHandle}</span>, reference{" "}
                            <span className="font-medium">{p.reference}</span>
                          </>
                        ) : (
                          <span className="whitespace-pre-wrap">
                            {business.bankInstructions} — reference {p.reference}
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="text-xs text-ink/45 mt-0.5">Card / Apple Pay</div>
                    )}
                  </div>
                  {p.method === "CARD" && <PayButton paymentId={p.id} />}
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      <div className="mb-8">
        <h2 className="text-sm font-medium text-ink mb-2.5">Upcoming</h2>
        {upcoming.length === 0 ? (
          <EmptyState title="Nothing upcoming" />
        ) : (
          <Card>
            <div className="divide-y divide-border">
              {upcoming.map((b) => (
                <div key={b.id} className="flex items-center justify-between gap-3 px-4 py-3.5">
                  <div>
                    <div className="text-sm font-medium">{b.service.name}</div>
                    <div className="text-xs text-ink/45">{format(toZonedDisplayDate(b.startAt, business.timezone), "EEEE, MMMM d 'at' h:mm a")}</div>
                  </div>
                  <Badge tone={STATUS_TONE[b.status] ?? "neutral"}>{b.status.replaceAll("_", " ").toLowerCase()}</Badge>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

      {past.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-medium text-ink mb-2.5">Past</h2>
          <Card>
            <div className="divide-y divide-border">
              {past.map((b) => (
                <div key={b.id} className="px-4 py-3.5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium">{b.service.name}</div>
                      <div className="text-xs text-ink/45">{format(toZonedDisplayDate(b.startAt, business.timezone), "MMM d, yyyy")}</div>
                    </div>
                    <Badge tone={STATUS_TONE[b.status] ?? "neutral"}>{b.status.replaceAll("_", " ").toLowerCase()}</Badge>
                  </div>
                  {b.deliveryUrl && (
                    <a
                      href={b.deliveryUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2.5 flex items-center gap-2 text-sm text-accent-text hover:underline bg-accent-soft/50 rounded-lg px-3 py-2"
                    >
                      <ExternalLink className="w-3.5 h-3.5 shrink-0" strokeWidth={2} />
                      View your gallery
                    </a>
                  )}
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      <div>
        <h2 className="text-sm font-medium text-ink mb-2.5">Messages</h2>
        <PortalMessages
          conversationId={conversation?.id ?? null}
          messages={(conversation?.messages ?? []).map((m) => ({ id: m.id, direction: m.direction, body: m.body, createdAt: m.createdAt.toISOString() }))}
        />
      </div>
    </div>
  );
}
