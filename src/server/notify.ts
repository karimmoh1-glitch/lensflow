import { prisma } from "@/lib/db";
import { pushToBusiness } from "@/server/push";
import { postSlackMessage } from "@/lib/slack";
import { reportFailure } from "@/lib/observe";
import { appUrl } from "@/lib/integrations/oauth";

/**
 * One notice, every place the business asked to hear it: the in-app list, the phone, and
 * Slack when a channel is connected. Titles and short bodies only — "Jane wrote to you",
 * "New booking · Saturday 2pm" — never the text of a customer's message.
 */
/**
 * Where a notice points. A structured target rather than a path, because the web app and
 * the phone app have different routes for the same record — and when both were handed one
 * hand-written path string, whichever app it was not written for silently sent people to a
 * page that does not exist. Naming the record instead makes that impossible.
 */
export type NoticeTarget =
  | { kind: "conversation"; id: string }
  | { kind: "booking"; id: string }
  | { kind: "client"; id: string }
  | { kind: "payments" }
  | { kind: "integrations" };

/** Inside the web dashboard, relative to /dashboard. */
export function webPath(t: NoticeTarget): string {
  switch (t.kind) {
    case "conversation": return `/inbox?c=${t.id}`;
    case "booking": return `/bookings/${t.id}`;
    case "client": return `/clients/${t.id}`;
    case "payments": return "/payments";
    case "integrations": return "/settings?tab=channels";
  }
}

/** Inside the phone app, as expo-router knows them. */
export function mobilePath(t: NoticeTarget): string {
  switch (t.kind) {
    case "conversation": return `/conversation/${t.id}`;
    case "booking": return `/booking/${t.id}`;
    case "client": return `/person/${t.id}`;
    case "payments": return "/(tabs)/today";
    case "integrations": return "/settings/integrations";
  }
}

export type Notice = { title: string; body: string; target?: NoticeTarget | null; kind?: "message" | "lead" | "booking" | "payment" | "integration" | "agent" };

export type SlackSettings = { teamId?: string; teamName?: string; botUserId?: string; channelId?: string | null; channelName?: string | null; lastPostAt?: string | null; lastPostError?: string | null };

export async function notifyBusiness(businessId: string, notice: Notice): Promise<void> {
  const target = notice.target ?? null;
  await prisma.notification.create({ data: { businessId, title: notice.title, body: notice.body, path: target ? webPath(target) : null } });
  void pushToBusiness(businessId, { title: notice.title, body: notice.body, data: target ? { path: mobilePath(target) } : undefined });
  void postToSlack(businessId, notice);
}

/** Post to the workspace's chosen Slack channel; a failure marks the row and reports, never throws. */
export async function postToSlack(businessId: string, notice: Notice): Promise<boolean> {
  const row = await prisma.integration.findUnique({ where: { businessId_provider: { businessId, provider: "SLACK" } } });
  if (!row || row.status === "NOT_CONNECTED" || !row.accessToken) return false;
  const settings = (row.settings ?? {}) as SlackSettings;
  if (!settings.channelId) return false;
  const link = notice.target ? `${appUrl()}/dashboard${webPath(notice.target)}` : null;
  try {
    await postSlackMessage(row.accessToken, settings.channelId, `*${notice.title}* — ${notice.body}`, link);
    await prisma.integration.update({ where: { id: row.id }, data: { settings: { ...settings, lastPostAt: new Date().toISOString(), lastPostError: null }, lastSyncStatus: "ok", lastSyncedAt: new Date(), lastError: null, lastErrorAt: null, status: row.status === "SYNC_ERROR" ? "CONNECTED" : row.status } });
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Slack refused the message";
    const revoked = /invalid_auth|token_revoked|account_inactive|not_authed|401/i.test(msg);
    const gone = /channel_not_found|not_in_channel|is_archived/i.test(msg);
    await prisma.integration.update({ where: { id: row.id }, data: { lastSyncStatus: "failed", lastError: revoked ? "Slack revoked access — reconnect" : gone ? "The Slack channel is gone — choose another" : "Slack didn't accept the last message. Daythread will try again on the next notice.", lastErrorAt: new Date(), status: revoked ? "NEEDS_ATTENTION" : "SYNC_ERROR", settings: { ...settings, lastPostError: gone ? "channel" : revoked ? "auth" : "other" } } });
    await reportFailure("delivery", "Slack post failed", { businessId, provider: "SLACK", error: err, level: "warn" });
    return false;
  }
}
