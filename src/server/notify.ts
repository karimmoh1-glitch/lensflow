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
export type Notice = { title: string; body: string; path?: string | null; kind?: "message" | "lead" | "booking" | "payment" | "integration" | "agent" };

export type SlackSettings = { teamId?: string; teamName?: string; botUserId?: string; channelId?: string | null; channelName?: string | null; lastPostAt?: string | null; lastPostError?: string | null };

export async function notifyBusiness(businessId: string, notice: Notice): Promise<void> {
  await prisma.notification.create({ data: { businessId, title: notice.title, body: notice.body } });
  void pushToBusiness(businessId, { title: notice.title, body: notice.body, data: notice.path ? { path: notice.path } : undefined });
  void postToSlack(businessId, notice);
}

/** Post to the workspace's chosen Slack channel; a failure marks the row and reports, never throws. */
export async function postToSlack(businessId: string, notice: Notice): Promise<boolean> {
  const row = await prisma.integration.findUnique({ where: { businessId_provider: { businessId, provider: "SLACK" } } });
  if (!row || row.status === "NOT_CONNECTED" || !row.accessToken) return false;
  const settings = (row.settings ?? {}) as SlackSettings;
  if (!settings.channelId) return false;
  const link = notice.path ? `${appUrl()}/dashboard${notice.path.startsWith("/") ? notice.path : `/${notice.path}`}` : null;
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

/** Web paths for the notices that name a record. */
export const noticePath = {
  conversation: (id: string) => `/inbox?c=${id}`,
  booking: (id: string) => `/bookings/${id}`,
  client: (id: string) => `/clients/${id}`,
  settings: () => `/settings?tab=connections`,
};
