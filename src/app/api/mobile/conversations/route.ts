import { NextResponse } from "next/server";
import { requireMobileBusiness, requireMobileRole, isErrorResponse, jsonError } from "@/lib/mobileApi";
import { getSessionFromRequest } from "@/lib/auth";
import { listConversations } from "@/server/mobileRead";
import { STAFF_ROLES } from "@/lib/auth";
import type { ChannelType } from "@prisma/client";

const CHANNELS = new Set(["INSTAGRAM", "EMAIL", "SMS", "WHATSAPP", "WEBSITE", "PHONE"]);

/** The inbox. `view=priority` is people with business value, in value order; `view=all` is everything, newest first. */
export async function GET(req: Request) {
  const ctx = await requireMobileRole(req, [...STAFF_ROLES]);
  if (isErrorResponse(ctx)) return ctx;
  const url = new URL(req.url);
  const view = url.searchParams.get("view") === "all" ? "all" : "priority";
  const filterParam = url.searchParams.get("filter");
  const filter = filterParam === "unread" || filterParam === "waiting" ? filterParam : "all";
  const channelParam = url.searchParams.get("channel");
  const channel = channelParam && CHANNELS.has(channelParam) ? (channelParam as ChannelType) : null;
  const q = (url.searchParams.get("q") ?? "").slice(0, 120);
  return NextResponse.json(await listConversations(ctx.business.id, { view, filter, channel, q }));
}
