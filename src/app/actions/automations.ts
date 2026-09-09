"use server";

import { prisma } from "@/lib/db";
import { track } from "@/lib/analytics";
import { requireRole, type SessionPayload } from "@/lib/auth";
import { automationsEntitled, canEnableAutomation, planLimits, PLANS, effectivePlan } from "@/lib/billing";
import { revalidatePath } from "next/cache";

/** Returns `{ error }` for expected outcomes (a plan limit) rather than throwing: a thrown
 * server-action error is a 500, and in production Next.js replaces its message with a
 * generic one — so the upgrade prompt would never reach the user. Throwing is reserved
 * for genuine failures (no session), which the client renders as a plain retry message. */
export async function toggleAutomation(id: string, enabled: boolean, session?: SessionPayload | null): Promise<{ error?: string }> {
  const ctx = await requireRole(["OWNER", "ADMIN", "PHOTOGRAPHER"], session);
  if (!ctx) throw new Error("unauthorized");
  // Automations are a Pro+ feature — only enforce on turning one ON. Turning one OFF
  // stays allowed regardless of plan, so a downgraded business isn't stuck unable to
  // disable something that's already running.
  if (enabled && !automationsEntitled(ctx.business)) {
    return { error: "Automations beyond three are part of Daythread Pro. Upgrade under Settings → Subscription." };
  }
  if (enabled) {
    // Count-based allowance (Free: 3 switched on at once), decided from the database row
    // inside a transaction so two quick toggles can't both squeeze past the cap.
    const refused = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Business" WHERE "id" = ${ctx.business.id} FOR UPDATE`;
      const fresh = await tx.business.findUniqueOrThrow({ where: { id: ctx.business.id }, select: { planTier: true, billingStatus: true, compedPlan: true } });
      const on = await tx.automation.count({ where: { businessId: ctx.business.id, enabled: true, id: { not: id } } });
      if (!canEnableAutomation(fresh, on)) return { limit: planLimits(fresh).maxAutomations, plan: effectivePlan(fresh) };
      await tx.automation.updateMany({ where: { id, businessId: ctx.business.id }, data: { enabled: true } });
      return null;
    });
    if (refused) return { error: `${PLANS[refused.plan].name} includes ${refused.limit} automations switched on at once. Turn one off, or upgrade to Pro for unlimited automations.` };
  } else {
    await prisma.automation.updateMany({ where: { id, businessId: ctx.business.id }, data: { enabled: false } });
  }
  await track(enabled ? "automation_enabled" : "automation_disabled", { businessId: ctx.business.id, properties: { automationId: id } });
  revalidatePath("/dashboard/automations");
  return {};
}

// ── Create / edit / delete ───────────────────────────────────────────────────

import { z } from "zod";

const TRIGGERS = ["BOOKING_CREATED", "DAYS_BEFORE_SHOOT", "SHOOT_COMPLETED", "LEAD_INACTIVE"] as const;
const ACTIONS = ["SEND_CONFIRMATION", "SEND_QUESTIONNAIRE", "SEND_REMINDER", "SEND_THANK_YOU", "SEND_FOLLOW_UP"] as const;
const VARIABLES = ["name", "service", "date", "time", "business"];

const AutomationSchema = z.object({
  name: z.string().trim().min(2, "Give it a name.").max(60),
  trigger: z.enum(TRIGGERS),
  action: z.enum(ACTIONS),
  offsetHours: z.number().int().min(0).max(24 * 60),
  messageTemplate: z
    .string()
    .trim()
    .min(5, "Write the message it should send.")
    .max(1000)
    .refine((t) => (t.match(/\{\{\s*([a-z]+)\s*\}\}/g) ?? []).every((m) => VARIABLES.includes(m.replace(/[{}\s]/g, ""))), { message: `Only these variables are filled in: ${VARIABLES.map((v) => `{{${v}}}`).join(" ")}` }),
});
export type AutomationInput = z.infer<typeof AutomationSchema>;

/**
 * Creates an automation for this workspace. It starts switched on when the plan has room
 * for another; otherwise it is saved switched off and the caller is told why — nothing
 * is refused outright, because writing the automation is useful even before upgrading.
 */
export async function createAutomation(input: AutomationInput, session?: SessionPayload | null): Promise<{ id?: string; error?: string; paused?: string }> {
  const ctx = await requireRole(["OWNER", "ADMIN", "PHOTOGRAPHER"], session);
  if (!ctx) throw new Error("unauthorized");
  const parsed = AutomationSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the details." };
  const data = parsed.data;
  // The same trigger, action and timing twice would message people twice. Point at the
  // existing one instead of creating a copy.
  const twin = await prisma.automation.findFirst({ where: { businessId: ctx.business.id, trigger: data.trigger, action: data.action, offsetHours: data.offsetHours }, select: { name: true } });
  if (twin) return { error: `You already have an automation that does this (“${twin.name}”). Edit that one instead of adding a copy.` };
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Business" WHERE "id" = ${ctx.business.id} FOR UPDATE`;
    const fresh = await tx.business.findUniqueOrThrow({ where: { id: ctx.business.id }, select: { planTier: true, billingStatus: true, compedPlan: true } });
    const on = await tx.automation.count({ where: { businessId: ctx.business.id, enabled: true } });
    const enabled = canEnableAutomation(fresh, on);
    const row = await tx.automation.create({ data: { businessId: ctx.business.id, name: data.name, trigger: data.trigger, action: data.action, offsetHours: data.offsetHours, messageTemplate: data.messageTemplate, enabled } });
    return { row, enabled, limit: planLimits(fresh).maxAutomations, plan: effectivePlan(fresh) };
  });
  await track("automation_created", { businessId: ctx.business.id, properties: { trigger: data.trigger, action: data.action, enabled: result.enabled } });
  if ((await prisma.automation.count({ where: { businessId: ctx.business.id } })) === 1) await track("first_automation_created", { businessId: ctx.business.id, properties: { trigger: data.trigger, action: data.action } });
  revalidatePath("/dashboard/automations");
  return { id: result.row.id, paused: result.enabled ? undefined : `${PLANS[result.plan].name} runs ${result.limit} automations at once. Turn one off to enable this one, or upgrade to Pro for unlimited.` };
}

export async function updateAutomation(id: string, input: AutomationInput, session?: SessionPayload | null): Promise<{ id?: string; error?: string; paused?: string }> {
  const ctx = await requireRole(["OWNER", "ADMIN", "PHOTOGRAPHER"], session);
  if (!ctx) throw new Error("unauthorized");
  const parsed = AutomationSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the details." };
  // Tenant-scoped: updateMany with the businessId is a no-op for anyone else's automation.
  const r = await prisma.automation.updateMany({ where: { id, businessId: ctx.business.id }, data: parsed.data });
  if (r.count === 0) return { error: "That automation doesn't exist in this workspace." };
  revalidatePath("/dashboard/automations");
  return { id };
}

export async function deleteAutomation(id: string, session?: SessionPayload | null): Promise<{ error?: string }> {
  const ctx = await requireRole(["OWNER", "ADMIN"], session);
  if (!ctx) throw new Error("unauthorized");
  const r = await prisma.automation.deleteMany({ where: { id, businessId: ctx.business.id } });
  if (r.count === 0) return { error: "That automation doesn't exist in this workspace." };
  await track("automation_deleted", { businessId: ctx.business.id, properties: { automationId: id } });
  revalidatePath("/dashboard/automations");
  return {};
}
