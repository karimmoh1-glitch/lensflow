import { NextResponse } from "next/server";
import { requireMobileBusiness, requireMobileRole, isErrorResponse, jsonError } from "@/lib/mobileApi";
import { getSessionFromRequest, STAFF_ROLES } from "@/lib/auth";
import { z } from "zod";
import { markConversationRead, reclassifyConversation, removeConversationForMe, assignConversation, setClientRelationship } from "@/app/actions/conversations";
import { deleteConversation } from "@/app/actions/inbox";

/** The thread's tools, the same actions as the web's "…" menu: read state, archive, what this sender is, who handles it, delete. */
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("read"), read: z.boolean() }),
  z.object({ action: z.literal("archive"), archived: z.boolean() }),
  z.object({ action: z.literal("reclassify"), category: z.enum(["PRIORITY", "AUTOMATED", "PROMOTIONAL", "VENDOR", "INTERNAL", "SPAM"]) }),
  z.object({ action: z.literal("assign"), membershipId: z.string().nullable() }),
  z.object({ action: z.literal("relationship"), clientId: z.string(), relationship: z.enum(["LEAD", "CUSTOMER", "CONTACT"]) }),
  z.object({ action: z.literal("delete") }),
]);
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireMobileRole(req, [...STAFF_ROLES]);
  if (isErrorResponse(ctx)) return ctx;
  const session = await getSessionFromRequest(req);
  const { id } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("Unknown action", 400);
  const a = parsed.data;
  try {
    if (a.action === "read") { await markConversationRead(id, a.read, session); return NextResponse.json({ ok: true }); }
    if (a.action === "archive") { const r = await removeConversationForMe(id, a.archived, session); return r.error ? jsonError(r.error, 400) : NextResponse.json({ ok: true }); }
    if (a.action === "reclassify") { const r = await reclassifyConversation(id, a.category, session); return r.error ? jsonError(r.error, 400) : NextResponse.json({ ok: true, ruleFor: r.ruleFor ?? null }); }
    if (a.action === "assign") { const r = await assignConversation(id, a.membershipId, session); return r.error ? jsonError(r.error, 400) : NextResponse.json({ ok: true, assignee: r.assignee ?? null }); }
    if (a.action === "relationship") { const r = await setClientRelationship(a.clientId, a.relationship, session); return r.error ? jsonError(r.error, 400) : NextResponse.json({ ok: true }); }
    await deleteConversation(id, session);
    return NextResponse.json({ ok: true });
  } catch (e) { return jsonError(e instanceof Error && e.message !== "unauthorized" ? e.message : "Not allowed", 403); }
}
