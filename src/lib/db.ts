import { PrismaClient } from "@prisma/client";
import { encryptToken, decryptToken } from "./tokenCrypto";

/** Encrypts a plain-string token value in place; passes through null/undefined, and
 * passes through Prisma's `{ set: ... }` update-operator shape with its inner value
 * encrypted too (none of this codebase's current call sites use that form for these two
 * fields — they always assign a plain string or null — but handling it keeps this correct
 * if that ever changes, rather than silently storing plaintext for that one shape).
 * Typed loosely (Prisma's generated create/update input unions are too complex to satisfy
 * structurally here); the runtime checks are what actually keep this safe. */
function encryptTokenValue(value: unknown): unknown {
  if (typeof value === "string") return encryptToken(value);
  if (value && typeof value === "object" && "set" in value && typeof (value as { set: unknown }).set === "string") {
    return { set: encryptToken((value as { set: string }).set) };
  }
  return value;
}

function encryptTokenFields<T extends Record<string, unknown>>(data: T): T {
  const next: Record<string, unknown> = { ...data };
  if ("accessToken" in next) next.accessToken = encryptTokenValue(next.accessToken);
  if ("refreshToken" in next) next.refreshToken = encryptTokenValue(next.refreshToken);
  return next as T;
}

function decryptTokenFields<T extends { accessToken?: string | null; refreshToken?: string | null }>(row: T): T {
  return {
    ...row,
    accessToken: typeof row.accessToken === "string" ? decryptToken(row.accessToken) : row.accessToken,
    refreshToken: typeof row.refreshToken === "string" ? decryptToken(row.refreshToken) : row.refreshToken,
  };
}

/**
 * Integration.accessToken/refreshToken (real Gmail OAuth tokens) are encrypted at rest —
 * a plaintext read/write there would mean a database leak directly yields working
 * send+read Gmail credentials for every connected business. Applied as a Prisma Client
 * Extension rather than at each of the several existing call sites: every current and
 * future `prisma.integration.*` call gets this transparently, so there's no call site
 * that can accidentally skip it. Only the `integration` model is touched — every other
 * model's queries pass through unchanged.
 */
/**
 * Any write to a Message bumps the owning workspace's inbox version (see
 * src/server/inboxSignal.ts). Done here so an ingestion path, an outbound send, a delivery
 * receipt or an automation cannot forget to; best-effort, never allowed to fail the write.
 */
const rawPrisma = new PrismaClient({ log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"] });
async function bumpFor(conversationIds: string[], messageIds: string[]): Promise<void> {
  try {
    const convIds = new Set(conversationIds);
    if (messageIds.length) for (const r of await rawPrisma.message.findMany({ where: { id: { in: messageIds } }, select: { conversationId: true } })) convIds.add(r.conversationId);
    if (!convIds.size) return;
    const convs = await rawPrisma.conversation.findMany({ where: { id: { in: [...convIds] } }, select: { businessId: true } });
    const businessIds = [...new Set(convs.map((c) => c.businessId))];
    if (businessIds.length) await rawPrisma.business.updateMany({ where: { id: { in: businessIds } }, data: { inboxVersion: { increment: 1 } } });
  } catch {
    // a missed bump means one late refresh, never a lost message
  }
}
const listOf = (v: unknown): string[] => (typeof v === "string" ? [v] : Array.isArray((v as { in?: string[] })?.in) ? (v as { in: string[] }).in : []);

const basePrisma = rawPrisma.$extends({
  query: {
    message: {
      async create({ args, query }) {
        const result = await query(args);
        const convId = (args.data as { conversationId?: string }).conversationId ?? (args.data as { conversation?: { connect?: { id?: string } } }).conversation?.connect?.id;
        await bumpFor(convId ? [convId] : [], convId ? [] : [(result as { id: string }).id]);
        return result;
      },
      async createMany({ args, query }) {
        const result = await query(args);
        const rows = Array.isArray(args.data) ? args.data : [args.data];
        await bumpFor(rows.map((r) => (r as { conversationId: string }).conversationId).filter(Boolean), []);
        return result;
      },
      async update({ args, query }) {
        const result = await query(args);
        await bumpFor([], [(result as { id: string }).id]);
        return result;
      },
      async updateMany({ args, query }) {
        const result = await query(args);
        const w = args.where as { id?: unknown; conversationId?: unknown } | undefined;
        if ((result as { count: number }).count > 0) await bumpFor(listOf(w?.conversationId), listOf(w?.id));
        return result;
      },
    },
    integration: {
      async create({ args, query }) {
        args.data = encryptTokenFields(args.data);
        return query(args);
      },
      async update({ args, query }) {
        args.data = encryptTokenFields(args.data);
        return query(args);
      },
      async updateMany({ args, query }) {
        args.data = encryptTokenFields(args.data);
        return query(args);
      },
      async upsert({ args, query }) {
        args.create = encryptTokenFields(args.create);
        args.update = encryptTokenFields(args.update);
        return query(args);
      },
      async findUnique({ args, query }) {
        const result = await query(args);
        return result ? decryptTokenFields(result) : result;
      },
      async findFirst({ args, query }) {
        const result = await query(args);
        return result ? decryptTokenFields(result) : result;
      },
      async findMany({ args, query }) {
        const results = await query(args);
        return results.map(decryptTokenFields);
      },
      async findUniqueOrThrow({ args, query }) {
        return decryptTokenFields(await query(args));
      },
      async findFirstOrThrow({ args, query }) {
        return decryptTokenFields(await query(args));
      },
    },
  },
});

type ExtendedPrismaClient = typeof basePrisma;
const globalForPrisma = globalThis as unknown as { prisma?: ExtendedPrismaClient };

export const prisma = globalForPrisma.prisma ?? basePrisma;

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

/** The extended client's type — use this instead of PrismaClient from @prisma/client in
 * any function signature that takes `prisma` as a parameter (e.g. seedDemo.ts), since the
 * extension changes the client's type and a plain PrismaClient annotation won't accept it. */
export type Db = typeof prisma;
