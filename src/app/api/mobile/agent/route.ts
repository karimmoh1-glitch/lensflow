import { NextResponse } from "next/server";
import { requireMobileRole, isErrorResponse, jsonError } from "@/lib/mobileApi";
import { businessAgentEntitled, effectivePlan } from "@/lib/billing";
import { buildAgentBrief } from "@/server/businessAgent";

/** The Business Agent's brief for the mobile app. 403 — with the plan named — for anything
 * but an entitled Business workspace; the plan is read from the database, never the request. */
export async function GET(req: Request) {
  const ctx = await requireMobileRole(req, ["OWNER", "ADMIN", "PHOTOGRAPHER"]);
  if (isErrorResponse(ctx)) return ctx;
  if (!businessAgentEntitled(ctx.business)) {
    return NextResponse.json({ error: "The Daythread Business Agent is part of the Business plan.", plan: effectivePlan(ctx.business), requiredPlan: "BUSINESS" }, { status: 403 });
  }
  const brief = await buildAgentBrief(ctx.business.id);
  return NextResponse.json({ plan: "BUSINESS", generatedAt: brief.generatedAt, proposals: brief.proposals, activity: brief.activity });
}

export async function POST() {
  return jsonError("Approve proposals from the web app for now.", 405);
}
