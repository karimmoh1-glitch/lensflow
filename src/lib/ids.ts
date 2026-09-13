/**
 * Server actions are public endpoints and their arguments arrive as whatever JSON the
 * caller posted. An "id" that is an object instead of a string is a Prisma filter in
 * disguise (`{ not: "" }` matches every row), so every action that takes an id checks the
 * shape first. Nothing Daythread issues as an id falls outside this: cuids, and the
 * provider ids the app passes through, are short and alphanumeric.
 */
const ID = /^[A-Za-z0-9_.:@+-]{1,128}$/;

export function isId(value: unknown): value is string {
  return typeof value === "string" && ID.test(value);
}

/** Throws unless every given value is an id-shaped string; `null` and `undefined` pass (optional ids). */
export function assertIds(...values: unknown[]): void {
  for (const v of values) {
    if (v === null || v === undefined) continue;
    if (!isId(v)) throw new Error("invalid id");
  }
}
