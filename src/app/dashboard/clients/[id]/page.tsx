import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { requireBusiness, homeRouteFor, STAFF_ROLES } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Card, CardBody, Badge, PageHeader, EmptyState } from "@/components/ui";
import { formatMoney, initials, toZonedDisplayDate } from "@/lib/utils";
import { format } from "date-fns";
import { NoteForm } from "./NoteForm";

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireBusiness();
  if (!ctx) redirect("/login");
  if (!STAFF_ROLES.includes(ctx.role)) redirect(homeRouteFor(ctx.role, ctx.business));
  const { business } = ctx;
  const { id } = await params;

  const client = await prisma.client.findFirst({
    where: { id, businessId: business.id },
    include: {
      bookings: { include: { service: true }, orderBy: { startAt: "desc" } },
      payments: { orderBy: { createdAt: "desc" } },
      conversations: { include: { messages: { orderBy: { createdAt: "desc" }, take: 1 } } },
      notes: { orderBy: { createdAt: "desc" }, include: { author: true } },
      subscriptions: { include: { plan: true } },
      leads: true,
      referrals: true,
    },
  });
  if (!client) notFound();

  const ltv = client.payments.filter((p) => p.status === "PAID").reduce((s, p) => s + p.amountCents, 0);

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-8 py-6 md:py-10">
      <div className="flex items-center gap-4 mb-8">
        <div className="w-14 h-14 rounded-full bg-accent-soft text-accent-text flex items-center justify-center text-lg font-semibold shrink-0">
          {initials(client.name)}
        </div>
        <div>
          <h1 className="font-display text-2xl">{client.name}</h1>
          <p className="text-sm text-ink/50">
            {[client.email, client.phone, client.instagram].filter(Boolean).join(" · ") || "No contact info"}
          </p>
        </div>
        <div className="ml-auto text-right">
          <div className="text-xs text-ink/40">Lifetime value</div>
          <div className="font-display text-2xl">{formatMoney(ltv)}</div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <section>
            <h2 className="font-display text-lg mb-3">Bookings</h2>
            {client.bookings.length === 0 ? (
              <EmptyState title="No bookings yet" />
            ) : (
              <Card>
                <div className="divide-y divide-border">
                  {client.bookings.map((b) => (
                    <Link key={b.id} href={`/dashboard/bookings/${b.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-black/[0.02]">
                      <div>
                        <div className="text-sm font-medium">{b.service.name}</div>
                        <div className="text-xs text-ink/45">{format(toZonedDisplayDate(b.startAt, business.timezone), "MMM d, yyyy")}</div>
                      </div>
                      <Badge tone="neutral">{b.status.replaceAll("_", " ").toLowerCase()}</Badge>
                    </Link>
                  ))}
                </div>
              </Card>
            )}
          </section>

          {client.subscriptions.length > 0 && (
            <section>
              <h2 className="font-display text-lg mb-3">Membership</h2>
              <Card>
                <CardBody>
                  {client.subscriptions.map((s) => (
                    <div key={s.id} className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium">{s.plan.name}</div>
                        <div className="text-xs text-ink/45">
                          {s.sessionsRemaining} session{s.sessionsRemaining !== 1 && "s"} remaining · renews {format(s.currentPeriodEnd, "MMM d")}
                        </div>
                      </div>
                      <Badge tone={s.status === "ACTIVE" ? "success" : "warning"}>{s.status.toLowerCase()}</Badge>
                    </div>
                  ))}
                </CardBody>
              </Card>
            </section>
          )}

          <section>
            <h2 className="font-display text-lg mb-3">Notes</h2>
            <NoteForm clientId={client.id} />
            <div className="mt-3 space-y-2">
              {client.notes.map((n) => (
                <Card key={n.id}>
                  <CardBody className="py-3">
                    <p className="text-sm">{n.body}</p>
                    <p className="text-xs text-ink/40 mt-1">
                      {n.author?.name ?? "Team"} · {format(n.createdAt, "MMM d, yyyy")}
                    </p>
                  </CardBody>
                </Card>
              ))}
            </div>
          </section>
        </div>

        <div className="space-y-4">
          <Card>
            <CardBody>
              <div className="text-xs font-semibold uppercase tracking-wide text-ink/40 mb-2">Payment history</div>
              {client.payments.length === 0 ? (
                <p className="text-xs text-ink/40">No payments yet</p>
              ) : (
                <div className="space-y-1.5">
                  {client.payments.slice(0, 6).map((p) => (
                    <div key={p.id} className="flex justify-between text-xs">
                      <span className="text-ink/55">{format(p.createdAt, "MMM d")}</span>
                      <span className="font-medium">{formatMoney(p.amountCents)}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>

          {client.referrals.length > 0 && (
            <Card>
              <CardBody>
                <div className="text-xs font-semibold uppercase tracking-wide text-ink/40 mb-2">Referrals</div>
                {client.referrals.map((r) => (
                  <div key={r.id} className="text-sm">
                    {r.name}
                  </div>
                ))}
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
