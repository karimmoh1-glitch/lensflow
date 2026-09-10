import { prisma } from "@/lib/db";
import { listInstagramSubscriptions, listInstagramConversations, listAppWebhookSubscriptions, instagramSelfIds } from "@/lib/meta/instagram";
import { metaWebhookUrl } from "@/lib/meta/config";
import { MetaApiError, scrubMetaMessage } from "@/lib/meta/common";
import { reportFailure } from "@/lib/observe";
import type { MetaIgnoreReason } from "@/server/metaInbound";

/**
 * "Is Instagram actually going to deliver DMs here?" — answered by asking Meta, not by
 * trusting the boolean written when the subscription was first made.
 *
 * Three independent things have to be true for a customer's DM to arrive, and each fails
 * silently on its own:
 *   1. the app itself subscribes to the `messages` field and points at this deployment;
 *   2. the connected account subscribes the app (`subscribed_apps`);
 *   3. Meta is willing to deliver this sender's message at all, which in development mode
 *      it only does for people who hold a role on the app.
 *
 * The check reports all three plus what has actually arrived, so "Meta never sent it" is
 * distinguishable from "we dropped it". Nothing here returns or stores a token, an app
 * secret, a message body, or a full account id.
 */
export type DeliveryCheck = {
  checkedAt: string;
  /** Meta's own answer for the connected account. */
  account: { subscribed: boolean; fields: string[]; error: string | null };
  /** Meta's own answer for the app. Not documented for this host, so it may be unavailable. */
  app: { known: boolean; messagesField: boolean | null; callbackMatches: boolean | null; error: string | null };
  /** What Meta's conversations API can see, as counts and timings only. */
  mailbox: { conversations: number; withInbound: number; latestInboundAt: string | null; latestInboundFrom: string | null; error: string | null };
  /** What has actually reached this deployment. */
  deliveries: { lastWebhookAt: string | null; total: number; last24h: number; lastReasons: MetaIgnoreReason[]; lastDeliveryAt: string | null };
  /** The single sentence a person should act on. */
  verdict: string;
};

const last4 = (id: string) => `…${id.slice(-4)}`;

export async function runInstagramDeliveryCheck(businessId: string): Promise<{ ok: true; check: DeliveryCheck } | { ok: false; error: string }> {
  const row = await prisma.integration.findUnique({ where: { businessId_provider: { businessId, provider: "INSTAGRAM" } } });
  if (!row || row.status === "NOT_CONNECTED" || !row.accessToken || !row.externalId) return { ok: false, error: "Instagram isn't connected for this workspace." };
  const selfIds = instagramSelfIds(row);

  const account: DeliveryCheck["account"] = { subscribed: false, fields: [], error: null };
  try {
    const r = await listInstagramSubscriptions(row.accessToken, row.externalId);
    account.subscribed = r.subscribed;
    account.fields = r.fields;
  } catch (err) {
    account.error = err instanceof MetaApiError ? scrubMetaMessage(err.message) : "Meta could not be reached.";
  }

  const app: DeliveryCheck["app"] = { known: false, messagesField: null, callbackMatches: null, error: null };
  const appResult = await listAppWebhookSubscriptions();
  if (appResult.ok) {
    const ig = appResult.subscriptions.find((s) => s.object === "instagram");
    app.known = true;
    app.messagesField = ig ? ig.fields.includes("messages") : false;
    app.callbackMatches = ig ? ig.callbackUrl === metaWebhookUrl() : false;
  } else {
    app.error = appResult.error;
  }

  const mailbox: DeliveryCheck["mailbox"] = { conversations: 0, withInbound: 0, latestInboundAt: null, latestInboundFrom: null, error: null };
  try {
    const convos = await listInstagramConversations(row.accessToken, 20);
    mailbox.conversations = convos.length;
    for (const c of convos) {
      const inbound = c.messages.filter((m) => m.from?.id && !selfIds.has(m.from.id));
      if (!inbound.length) continue;
      mailbox.withInbound++;
      for (const m of inbound) {
        const at = new Date(m.created_time);
        if (Number.isNaN(at.getTime())) continue;
        if (!mailbox.latestInboundAt || at > new Date(mailbox.latestInboundAt)) {
          mailbox.latestInboundAt = at.toISOString();
          mailbox.latestInboundFrom = last4(m.from.id);
        }
      }
    }
  } catch (err) {
    mailbox.error = err instanceof MetaApiError ? scrubMetaMessage(err.message) : "Meta could not be reached.";
  }

  // Scoped to this workspace. A delivery that reached a different tenant says nothing about
  // whether this account's DMs are arriving, and counting it would make a silent connection
  // look healthy on a busy deployment.
  const since = new Date(Date.now() - 86_400_000);
  const mine = { provider: "meta", businessId } as const;
  const [total, last24h, latest] = await Promise.all([
    prisma.webhookEvent.count({ where: mine }),
    prisma.webhookEvent.count({ where: { ...mine, receivedAt: { gt: since } } }),
    prisma.webhookEvent.findFirst({ where: mine, orderBy: { receivedAt: "desc" }, select: { receivedAt: true, payload: true } }),
  ]);
  const payload = (latest?.payload ?? null) as { reasons?: MetaIgnoreReason[] } | null;
  const deliveries: DeliveryCheck["deliveries"] = {
    lastWebhookAt: row.lastWebhookAt?.toISOString() ?? null,
    total,
    last24h,
    lastReasons: Array.isArray(payload?.reasons) ? payload!.reasons! : [],
    lastDeliveryAt: latest?.receivedAt.toISOString() ?? null,
  };

  const check: DeliveryCheck = { checkedAt: new Date().toISOString(), account, app, mailbox, deliveries, verdict: verdictFor({ account, app, mailbox, deliveries }) };

  // Kept on the row so the card can show the last answer without asking Meta again, and so
  // an operator can see it later. Counts and states only.
  const settings = (row.settings as Record<string, unknown> | null) ?? {};
  await prisma.integration
    .update({ where: { id: row.id }, data: { settings: { ...settings, webhooksSubscribed: account.error ? settings.webhooksSubscribed : account.subscribed, webhooksCheckedAt: check.checkedAt, deliveryCheck: check as unknown as object } } })
    .catch((err) => reportFailure("sync", "Instagram delivery check could not be recorded", { businessId, provider: "INSTAGRAM", error: err, level: "warn" }));

  return { ok: true, check };
}

function verdictFor(c: Pick<DeliveryCheck, "account" | "app" | "mailbox" | "deliveries">): string {
  if (c.account.error) return "Meta did not answer when asked whether this account is subscribed. Try again in a minute.";
  if (!c.account.subscribed) return "Meta says this account is not subscribed to message events. Reconnect Instagram to re-subscribe.";
  if (c.app.known && c.app.messagesField === false) return "The account is subscribed, but the app itself has no 'messages' webhook field configured, so Meta delivers nothing. This is fixed in the Meta app dashboard, under the Instagram product's webhooks.";
  if (c.app.known && c.app.callbackMatches === false) return "The app's webhook points at a different URL than this deployment, so deliveries go elsewhere. Fix the callback URL in the Meta app dashboard.";
  if (c.mailbox.error) return "Meta did not answer when asked for recent conversations. Try again in a minute.";
  if (c.mailbox.withInbound > 0 && c.deliveries.last24h === 0) return "Meta has a customer message for this account but has delivered no webhook here in 24 hours. The subscription is right, so this is Meta withholding delivery — in development mode it only delivers for people with a role on the app.";
  if (c.mailbox.withInbound > 0) return "Meta has customer messages and is delivering webhooks. Anything missing from the inbox was dropped here, and the last delivery's reasons say why.";
  if (c.deliveries.last24h > 0) return "Webhooks are arriving. Meta reports no customer message on this account yet.";
  return "Everything Daythread can check is correct, and Meta reports no customer message and has sent no event. Nothing has been sent to this account that Meta is willing to share.";
}
