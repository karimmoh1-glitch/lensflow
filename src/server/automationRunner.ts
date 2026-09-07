import { prisma } from "@/lib/db";
import { deliverToCustomer, type Delivery } from "@/server/deliver";
import { automationsEntitled, planLimits } from "@/lib/billing";
import { toZonedDisplayDate, firstName } from "@/lib/utils";
import { format, subHours, addHours, subDays } from "date-fns";
import type { AutomationAction, AutomationTrigger, Prisma } from "@prisma/client";

/**
 * The automation runner. Automations were a page of toggles with nothing behind them;
 * this is what runs them.
 *
 * Two entry points:
 *   - fireAutomationEvent: called at the moment something happens (a booking is created, a
 *     ). Runs every enabled automation on that trigger for that target.
 *   - runScheduledAutomations: called by the cron route. Sweeps the time-based triggers —
 *     days before a shoot, after a shoot completes, lead
 *     inactive — and runs whichever are due.
 *
 * Every run is recorded as an AutomationExecution (sent / skipped / failed) and is
 * idempotent per (automation, target): a message is never sent twice for the same thing.
 * The message goes out on the client's own channel and is written into their conversation
 * as an outbound message, so the thread shows what Daythread sent on the owner's behalf.
 * Entitlement is enforced here, server-side, at run time — not only at the toggle.
 */
type Target = { targetType: "booking" | "lead"; targetId: string };

export async function fireAutomationEvent(params: { businessId: string; trigger: AutomationTrigger } & Target) {
  const { businessId, trigger, targetType, targetId } = params;
  const automations = await prisma.automation.findMany({ where: { businessId, trigger, enabled: true } });
  if (automations.length === 0) return { ran: 0 };
  let ran = 0;
  for (const automation of automations) {
    await runOne(automation, { targetType, targetId });
    ran++;
  }
  return { ran };
}

export async function runScheduledAutomations(now = new Date()) {
  const automations = await prisma.automation.findMany({
    where: { enabled: true, trigger: { in: ["DAYS_BEFORE_SHOOT", "SHOOT_COMPLETED", "LEAD_INACTIVE"] } },
  });
  const summary = { checked: automations.length, sent: 0, skipped: 0, not_configured: 0, failed: 0 };
  for (const automation of automations) {
    const targets = await dueTargets(automation, now);
    for (const t of targets) {
      const r = await runOne(automation, t);
      summary[r]++;
    }
  }
  return summary;
}

async function dueTargets(automation: { id: string; businessId: string; trigger: AutomationTrigger; offsetHours: number }, now: Date): Promise<Target[]> {
  const { businessId, trigger, offsetHours } = automation;
  switch (trigger) {
    case "DAYS_BEFORE_SHOOT": {
      // Bookings starting within the window [now, now + offset]; the per-target dedupe
      // makes the window safe to sweep hourly.
      const rows = await prisma.booking.findMany({
        where: { businessId, status: { notIn: ["CANCELED", "COMPLETED", "BALANCE_PAID", "FOLLOWED_UP", "INQUIRY"] }, startAt: { gt: now, lte: addHours(now, Math.max(1, offsetHours)) } },
        select: { id: true },
      });
      return rows.map((r) => ({ targetType: "booking", targetId: r.id }));
    }
    case "SHOOT_COMPLETED": {
      const rows = await prisma.booking.findMany({
        where: { businessId, status: { in: ["COMPLETED", "BALANCE_PAID"] }, endAt: { lte: subHours(now, Math.max(0, offsetHours)), gte: subDays(now, 14) } },
        select: { id: true },
      });
      return rows.map((r) => ({ targetType: "booking", targetId: r.id }));
    }
    case "LEAD_INACTIVE": {
      // You replied, they went quiet for offsetHours (default 72h), and nothing is booked.
      const cutoff = subHours(now, Math.max(24, offsetHours || 72));
      const rows = await prisma.lead.findMany({
        where: { businessId, status: { in: ["CONTACTED", "QUALIFIED"] }, respondedAt: { not: null, lte: cutoff }, lastInboundAt: { lte: cutoff } },
        select: { id: true },
      });
      return rows.map((r) => ({ targetType: "lead", targetId: r.id }));
    }
    default:
      return [];
  }
}

/** Execution results: sent · skipped (dedupe, entitlement, no address) · not_configured
 * (the channel has no provider on this deployment — nothing left) · failed. */
export type RunResult = "sent" | "skipped" | "not_configured" | "failed";

async function runOne(automation: { id: string; businessId: string; name: string; messageTemplate: string; trigger: AutomationTrigger; action: AutomationAction }, target: Target): Promise<RunResult> {
  const { businessId } = automation;
  // Idempotent per target. A not_configured run is retried once the channel exists.
  const already = await prisma.automationExecution.findFirst({ where: { automationId: automation.id, targetId: target.targetId, result: { in: ["sent", "skipped"] } } });
  if (already) return "skipped";
  // Two automations doing the same thing (a recipe added twice, an edited copy) must not
  // message the same person twice: once any automation has sent — or written the not-yet-
  // deliverable message into the thread — for this action and target, the others record a
  // skip instead of a second send.
  const sentByAnother = await prisma.automationExecution.findFirst({ where: { businessId, targetId: target.targetId, result: { in: ["sent", "not_configured"] }, automationId: { not: automation.id }, automation: { action: automation.action } }, select: { id: true } });
  if (sentByAnother) {
    await prisma.automationExecution.create({ data: { businessId, automationId: automation.id, targetType: target.targetType, targetId: target.targetId, result: "skipped" } });
    return "skipped";
  }

  const business = await prisma.business.findUnique({ where: { id: businessId } });
  if (!business) return "failed";
  const record = (result: RunResult) =>
    prisma.automationExecution.create({ data: { businessId, automationId: automation.id, targetType: target.targetType, targetId: target.targetId, result } });

  // Server-side entitlement at run time: a downgraded business's automations stop, and a
  // plan with a count cap runs only its oldest N switched-on automations — the rest stay
  // configured but paused until something is turned off or the plan changes.
  if (!automationsEntitled(business)) {
    await record("skipped");
    return "skipped";
  }
  const cap = planLimits(business).maxAutomations;
  if (Number.isFinite(cap)) {
    const allowed = await prisma.automation.findMany({ where: { businessId, enabled: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: cap, select: { id: true } });
    if (!allowed.some((a) => a.id === automation.id)) {
      await record("skipped");
      return "skipped";
    }
  }

  const ctx = await loadContext(businessId, target);
  if (!ctx) {
    await record("skipped");
    return "skipped";
  }

  const body = interpolate(automation.messageTemplate, { business: business.name, name: firstName(ctx.clientName), service: ctx.serviceName ?? "your session", date: ctx.date ?? "", time: ctx.time ?? "", amount: ctx.amount ?? "" });

  const channel = ctx.conversation?.channel ?? (ctx.clientEmail ? "EMAIL" : ctx.clientPhone ? "SMS" : null);
  const to = ctx.conversation?.externalHandle ?? ctx.clientEmail ?? ctx.clientPhone ?? null;
  if (!channel || !to) {
    await record("skipped");
    return "skipped";
  }

  const lastInbound = ctx.conversation ? await prisma.message.findFirst({ where: { conversationId: ctx.conversation.id, direction: "INBOUND" }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }) : null;
  const delivery = await deliverToCustomer({ businessId, businessName: business.name, businessHandle: business.handle, channel, to, body, subject: `${business.name}: ${automation.name}`, lastInboundAt: lastInbound?.createdAt ?? null }).catch((err) => {
    console.error("[automations] send failed", err);
    return { status: "FAILED", error: "Send failed", via: "none", providerMessageId: undefined } as Delivery;
  });
  const ok = delivery.status === "SENT";
  const providerMessageId = delivery.providerMessageId;

  // Write it into the thread so the owner sees what went out on their behalf.
  const conversationId =
    ctx.conversation?.id ??
    (ctx.clientId
      ? (await prisma.conversation.create({ data: { businessId, clientId: ctx.clientId, channel, externalHandle: to, lastMessageAt: new Date(), category: "PRIORITY", categoryReason: "Existing customer.", categorySource: "rules" } })).id
      : null);
  if (conversationId) {
    await prisma.$transaction([
      prisma.message.create({ data: { conversationId, direction: "OUTBOUND", body, status: delivery.status, statusDetail: delivery.statusDetail, providerMessageId } }),
      prisma.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: new Date() } }),
    ]);
  }
  const result: RunResult = ok ? "sent" : delivery.status === "NOT_DELIVERED" ? "not_configured" : "failed";
  await record(result);
  return result;
}

type Ctx = {
  clientId: string | null;
  clientName: string;
  clientEmail: string | null;
  clientPhone: string | null;
  serviceName: string | null;
  date: string | null;
  time: string | null;
  amount: string | null;
  conversation: { id: string; channel: "EMAIL" | "SMS" | "WHATSAPP" | "INSTAGRAM" | "WEBSITE" | "PHONE"; externalHandle: string | null } | null;
};

async function loadContext(businessId: string, target: Target): Promise<Ctx | null> {
  const business = await prisma.business.findUnique({ where: { id: businessId }, select: { timezone: true } });
  const tz = business?.timezone ?? "America/New_York";
  const convFor = (clientId: string, preferredId?: string | null) =>
    prisma.conversation.findFirst({
      where: { businessId, clientId, archived: false, ...(preferredId ? { id: preferredId } : {}) },
      orderBy: { lastMessageAt: "desc" },
      select: { id: true, channel: true, externalHandle: true },
    });
  if (target.targetType === "booking") {
    const b = await prisma.booking.findFirst({ where: { id: target.targetId, businessId }, include: { client: true, service: true } });
    if (!b) return null;
    const start = toZonedDisplayDate(b.startAt, tz);
    const conversation = (await convFor(b.clientId, b.conversationId)) ?? (await convFor(b.clientId));
    return { clientId: b.clientId, clientName: b.client.name, clientEmail: b.client.email, clientPhone: b.client.phone, serviceName: b.service.name, date: format(start, "EEEE, MMMM d"), time: format(start, "h:mm a"), amount: `$${(b.totalCents / 100).toLocaleString()}`, conversation };
  }
  const l = await prisma.lead.findFirst({ where: { id: target.targetId, businessId }, include: { client: true, service: true, conversation: { select: { id: true, channel: true, externalHandle: true } } } });
  if (!l || !l.client) return null;
  return { clientId: l.clientId, clientName: l.client.name, clientEmail: l.client.email, clientPhone: l.client.phone, serviceName: l.service?.name ?? null, date: l.requestedDateText, time: null, amount: l.estimatedValueCents ? `$${(l.estimatedValueCents / 100).toLocaleString()}` : null, conversation: l.conversation };
}

export function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => vars[k] ?? "").replace(/[ \t]{2,}/g, " ").trim();
}

export type AutomationRunSummary = Awaited<ReturnType<typeof runScheduledAutomations>>;
export type AutomationWhere = Prisma.AutomationWhereInput;
