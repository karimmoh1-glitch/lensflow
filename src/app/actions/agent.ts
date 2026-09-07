"use server";

import { revalidatePath } from "next/cache";
import { requireRole, type SessionPayload } from "@/lib/auth";
import { businessAgentEntitled, effectivePlan, planLimits, PLANS } from "@/lib/billing";
import { buildAgentBrief, findProposal, draftForProposal, executeProposal, type AgentBrief, type AgentProposal } from "@/server/businessAgent";
import { dbRateLimit } from "@/lib/dbRateLimit";
import { track } from "@/lib/analytics";
import { z } from "zod";

/**
 * The assistant's server boundary. Every entry point re-reads the plan from the database
 * and returns a structured denial for Free — the client can claim whatever it likes;
 * nothing here runs unless the row says Pro or Business and the subscription is entitled.
 * Staff only (owners, admins, team members); never clients or partners.
 */
const STAFF = ["OWNER", "ADMIN", "PHOTOGRAPHER"] as const;

export type AgentGate = { allowed: false; plan: "FREE" | "PRO" | "BUSINESS"; reason: string };

function denial(plan: "FREE" | "PRO" | "BUSINESS"): AgentGate {
  return { allowed: false, plan, reason: `The Daythread assistant is part of Daythread Pro. You're on ${PLANS[plan].name}.` };
}

export async function getAgentBrief(session?: SessionPayload | null): Promise<AgentGate | { allowed: true; brief: AgentBrief }> {
  const ctx = await requireRole([...STAFF], session);
  if (!ctx) throw new Error("unauthorized");
  if (!businessAgentEntitled(ctx.business)) return denial(effectivePlan(ctx.business));
  return { allowed: true, brief: await buildAgentBrief(ctx.business.id) };
}

/** Prepares a proposal for approval: the draft the agent would send, from real data. */
export async function prepareAgentProposal(proposalId: string, session?: SessionPayload | null): Promise<AgentGate | { allowed: true; proposal: AgentProposal; draft: string | null } | { allowed: true; error: string }> {
  const ctx = await requireRole([...STAFF], session);
  if (!ctx) throw new Error("unauthorized");
  if (!businessAgentEntitled(ctx.business)) return denial(effectivePlan(ctx.business));
  const proposal = await findProposal(ctx.business.id, String(proposalId));
  if (!proposal) return { allowed: true, error: "That suggestion is no longer current — the situation changed." };
  return { allowed: true, proposal, draft: await draftForProposal(ctx.business.id, proposal) };
}

const ApproveSchema = z.object({ proposalId: z.string().min(3).max(120), body: z.string().trim().min(1, "Write something to send.").max(2000) });

export async function approveAgentProposal(input: { proposalId: string; body: string }, session?: SessionPayload | null): Promise<AgentGate | { allowed: true; ok: true; note: string; status: "SENT" | "NOT_DELIVERED" } | { allowed: true; ok: false; error: string }> {
  const ctx = await requireRole([...STAFF], session);
  if (!ctx) throw new Error("unauthorized");
  if (!businessAgentEntitled(ctx.business)) return denial(effectivePlan(ctx.business));
  const parsed = ApproveSchema.safeParse(input);
  if (!parsed.success) return { allowed: true, ok: false, error: parsed.error.issues[0]?.message ?? "Check the message." };
  const hourly = planLimits(ctx.business).agentHourlyLimit;
  if (!(await dbRateLimit(ctx.business.id, "agent_action_approved", { limit: hourly, windowMs: 60 * 60 * 1000 })).ok) return { allowed: true, ok: false, error: `The assistant has sent ${hourly} messages in the last hour, which is ${PLANS[effectivePlan(ctx.business)].name}'s cap. Nothing was sent; try again in a while.` };
  const proposal = await findProposal(ctx.business.id, parsed.data.proposalId);
  if (!proposal) return { allowed: true, ok: false, error: "That suggestion is no longer current — the situation changed." };
  await track("agent_action_approved", { businessId: ctx.business.id, properties: { kind: proposal.kind } });
  const result = await executeProposal({ businessId: ctx.business.id, userId: ctx.session.userId, proposal, body: parsed.data.body });
  revalidatePath("/dashboard/agent");
  revalidatePath("/dashboard/inbox");
  revalidatePath("/dashboard");
  if (!result.ok) return { allowed: true, ok: false, error: result.error };
  return { allowed: true, ok: true, note: result.note, status: result.status };
}

/** Dismiss without sending: remembered for a week so the same suggestion doesn't nag. */
export async function dismissAgentProposal(proposalId: string, session?: SessionPayload | null): Promise<AgentGate | { allowed: true }> {
  const ctx = await requireRole([...STAFF], session);
  if (!ctx) throw new Error("unauthorized");
  if (!businessAgentEntitled(ctx.business)) return denial(effectivePlan(ctx.business));
  const id = String(proposalId).slice(0, 120);
  await track("agent_action_executed", { businessId: ctx.business.id, properties: { proposalId: id, kind: id.split(":")[0], title: "Dismissed", result: "dismissed", userId: ctx.session.userId } });
  revalidatePath("/dashboard/agent");
  return { allowed: true };
}
