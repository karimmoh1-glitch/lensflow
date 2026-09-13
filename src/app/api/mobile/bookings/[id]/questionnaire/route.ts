import { requireMobileRole, isErrorResponse, jsonError } from "@/lib/mobileApi";
import { STAFF_ROLES } from "@/lib/auth";

/**
 * Retired. This used to message the client "please fill out this quick questionnaire" with
 * no link to anything — Daythread has never hosted a questionnaire form — and then mark it
 * sent. Older app builds still call it, so it answers with the honest alternative instead of
 * a 404, and sends nothing.
 */
export async function POST(req: Request) {
  const ctx = await requireMobileRole(req, [...STAFF_ROLES]);
  if (isErrorResponse(ctx)) return ctx;
  return jsonError("Daythread doesn't host questionnaires. Send yours as a reply in the conversation, with your own link, or as an automation you write.", 410);
}
