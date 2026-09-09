import { NextResponse } from "next/server";
import { requireMobileBusiness, requireMobileRole, isErrorResponse, jsonError } from "@/lib/mobileApi";
import { getSessionFromRequest, STAFF_ROLES } from "@/lib/auth";
import { z } from "zod";
import { startUpgradeCheckout, openBillingPortal } from "@/app/actions/billing";
/** POST { kind: "checkout", plan, interval, trial } or { kind: "portal" } → a URL on Stripe's own pages to open in the system browser. Nothing about a card ever touches the app. */
const schema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("checkout"), plan: z.enum(["PRO", "BUSINESS"]), interval: z.enum(["month", "year"]).default("month"), trial: z.boolean().optional() }),
  z.object({ kind: z.literal("portal"), flow: z.enum(["payment_method"]).optional() }),
]);
export async function POST(req: Request) {
  const ctx = await requireMobileRole(req, ["OWNER"]);
  if (isErrorResponse(ctx)) return ctx;
  const session = await getSessionFromRequest(req);
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("Unknown request", 400);
  const r = parsed.data.kind === "checkout" ? await startUpgradeCheckout(parsed.data.plan, parsed.data.interval, session, { trial: parsed.data.trial, source: "mobile" }) : await openBillingPortal(parsed.data.flow, session);
  if (r.error) return jsonError(r.error, 400);
  if ("changed" in r && r.changed) return NextResponse.json({ changed: true });
  return NextResponse.json({ url: r.url ?? null });
}
