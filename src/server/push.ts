import { prisma } from "@/lib/db";
import { reportFailure } from "@/lib/observe";

/**
 * Push to the app, through Expo's push service. Tokens live on the membership (one person,
 * several devices); a token Expo reports as no longer registered is dropped. Content is
 * the same the in-app notification carries — who wrote, on which channel — never the
 * message itself. Nothing here throws into the caller: a failed push is an OpsEvent.
 */
const EXPO_PUSH = "https://exp.host/--/api/v2/push/send";
const STAFF = ["OWNER", "ADMIN", "PHOTOGRAPHER"] as const;

export function isExpoPushToken(t: string): boolean {
  return /^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{10,}\]$/.test(t);
}

export async function registerPushToken(membershipId: string, token: string): Promise<boolean> {
  if (!isExpoPushToken(token)) return false;
  const m = await prisma.orgMembership.findUnique({ where: { id: membershipId }, select: { pushTokens: true } });
  if (!m) return false;
  if (!m.pushTokens.includes(token)) await prisma.orgMembership.update({ where: { id: membershipId }, data: { pushTokens: [...m.pushTokens.slice(-4), token] } });
  return true;
}

export async function unregisterPushToken(membershipId: string, token: string): Promise<void> {
  const m = await prisma.orgMembership.findUnique({ where: { id: membershipId }, select: { pushTokens: true } });
  if (!m) return;
  await prisma.orgMembership.update({ where: { id: membershipId }, data: { pushTokens: m.pushTokens.filter((t) => t !== token) } });
}

export type PushMessage = { title: string; body: string; data?: Record<string, string> };

/** Sends to every staff device in the business. Returns how many tokens were addressed. */
export async function pushToBusiness(businessId: string, message: PushMessage): Promise<number> {
  const members = await prisma.orgMembership.findMany({ where: { businessId, status: "ACTIVE", role: { in: [...STAFF] } }, select: { id: true, pushTokens: true } });
  const targets = members.flatMap((m) => m.pushTokens.map((token) => ({ membershipId: m.id, token })));
  if (targets.length === 0) return 0;
  try {
    const res = await fetch(EXPO_PUSH, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", ...(process.env.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` } : {}) },
      body: JSON.stringify(targets.map((t) => ({ to: t.token, title: message.title, body: message.body, data: message.data ?? {}, sound: "default" }))),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`Expo push ${res.status}`);
    const json = (await res.json().catch(() => null)) as { data?: Array<{ status: string; details?: { error?: string } }> } | null;
    const tickets = json?.data ?? [];
    await Promise.all(tickets.map((t, i) => (t.status === "error" && t.details?.error === "DeviceNotRegistered" ? unregisterPushToken(targets[i].membershipId, targets[i].token) : Promise.resolve())));
  } catch (err) {
    await reportFailure("delivery", "Push notification failed", { businessId, provider: "expo", error: err });
  }
  return targets.length;
}
