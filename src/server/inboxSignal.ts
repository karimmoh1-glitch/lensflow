import { prisma } from "@/lib/db";

/**
 * The live inbox, in the smallest reliable form the stack allows.
 *
 * Every message write bumps `Business.inboxVersion` (the Prisma extension in src/lib/db.ts
 * does it for any create/update on Message, so no call site can forget). The browser holds
 * one server-sent-events stream per open tab that watches the number and refreshes the page
 * when it changes. No provider is polled by the client; the stream reads one indexed row
 * every few seconds and closes itself before the platform's function limit, and the
 * browser reconnects.
 */
export async function bumpInbox(businessId: string): Promise<void> {
  await prisma.business.update({ where: { id: businessId }, data: { inboxVersion: { increment: 1 } } }).catch(() => {});
}

export async function getInboxVersion(businessId: string): Promise<number> {
  const b = await prisma.business.findUnique({ where: { id: businessId }, select: { inboxVersion: true } });
  return b?.inboxVersion ?? 0;
}

/** A verified provider event reached this connection: remembered for diagnostics. */
export async function markWebhookSeen(businessId: string, provider: "INSTAGRAM" | "WHATSAPP" | "SMS" | "EMAIL", at = new Date()): Promise<void> {
  await prisma.integration.updateMany({ where: { businessId, provider }, data: { lastWebhookAt: at } }).catch(() => {});
}

/**
 * Yields the version whenever it changes, checking every `everyMs`, for at most `maxMs`.
 * The stream route wraps this; tests drive it directly.
 */
export async function* watchInboxVersion(businessId: string, opts: { everyMs?: number; maxMs?: number; from?: number; signal?: AbortSignal } = {}): AsyncGenerator<number> {
  const everyMs = opts.everyMs ?? 2500;
  const maxMs = opts.maxMs ?? 45_000;
  let last = opts.from ?? (await getInboxVersion(businessId));
  const started = Date.now();
  while (Date.now() - started < maxMs && !opts.signal?.aborted) {
    await new Promise((r) => setTimeout(r, everyMs));
    if (opts.signal?.aborted) return;
    const now = await getInboxVersion(businessId);
    if (now !== last) { last = now; yield now; }
  }
}
