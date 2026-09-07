import { prisma } from "./db";

/**
 * A database-wide mutex for "check, then write" sequences that must not interleave: the
 * same webhook delivered twice at once, one booking event handled by two instances, two
 * invitations racing for the last seat. A Postgres transaction-scoped advisory lock keyed
 * by `key` is held for the duration of `fn` — the holder is a dedicated transaction, the
 * work inside `fn` uses the normal client and commits as it goes, and the lock releases
 * when `fn` returns (or throws). Serverless-safe: no in-process state, and the lock dies
 * with the connection if an instance disappears.
 */
export async function withLock<T>(key: string, fn: () => Promise<T>, opts: { timeoutMs?: number } = {}): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
      return fn();
    },
    { timeout: opts.timeoutMs ?? 30_000, maxWait: 15_000 }
  );
}
