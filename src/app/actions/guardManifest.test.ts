import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";

/**
 * Every server action and every non-mobile API route, checked for a guard at the source
 * level rather than one test per entry point.
 *
 * A server action is a public HTTP endpoint wearing a function's clothes: anyone who can
 * reach the site can post to it with any arguments they like. The protection is that the
 * first thing it does is resolve the caller's workspace and role from the session. Nothing
 * makes that happen, so this walks the tree and fails when an action or route has no guard
 * and no written reason for not having one.
 *
 * The mobile API has its own manifest next door; this is everything else.
 */
const ACTIONS = path.join(process.cwd(), "src/app/actions");
const API = path.join(process.cwd(), "src/app/api");

/** Calls that establish who the caller is and what workspace they are acting in. */
const GUARDS = [
  "requireRole(",
  "requireBusiness(",
  "requireClientRecord(",
  "requirePartner(",
  "requireFounder(",
  "isFounder(",
  "verifySeedSecret(",
];

/** Server actions that are deliberately reachable without a session, and why. */
const PUBLIC_ACTIONS: Record<string, string> = {
  "auth.ts:signup": "Creating an account cannot require one. Rate limited per address and IP.",
  "auth.ts:login": "Where a session comes from. Rate limited.",
  "auth.ts:logout": "Clears the cookie; there is nothing to protect.",
  "auth.ts:forgotPassword": "A password reset cannot require being signed in. Rate limited, and it never says whether the address exists.",
  "auth.ts:resetPassword": "Authorized by the single-use token in the link, not by a session.",
  "auth.ts:personalWorkspaceName": "Pure string formatting, no data access.",
  "auth.ts:uniqueHandle": "Picks an unused handle during signup; touches no existing workspace's data.",
  "googleSignIn.ts:startGoogleSignIn": "Signing in with Google, before any session exists. Rate limited.",
  "invitations.ts:previewInvitation": "The invitee has no account yet. Authorized by the token, throttled, and it returns only what the invitation itself says.",
  "invitations.ts:acceptInvitation": "Authorized by the single-use invitation token. Rate limited per token and per IP.",
  "publicBooking.ts:getSlotsForDate": "The public booking page. Rate limited, bounded lookahead, and it returns times only.",
  "publicBooking.ts:createPublicBooking": "The public booking page. Rate limited, and the slot is re-checked under a lock.",
  "websiteLead.ts:submitWebsiteLead": "A contact form on a business's own public page. Rate limited.",
  "landing.ts:recordLandingEvent": "Anonymous analytics from the marketing site. Rate limited, writes no tenant data.",
  "onboardingEvents.ts:recordOnboardingEvent": "Anonymous analytics from the signup flow. Rate limited.",
  "workspace.ts:switchWorkspace": "Guarded by setActiveBusiness, which refuses anything but an active membership of the caller's own.",
  "settings.ts:changePassword": "Acts only on the caller's own account, and verifies the current password first.",
};

/** API routes outside the mobile tree that are deliberately reachable without a session. */
const PUBLIC_ROUTES: Record<string, string> = {
  "auth/google/callback/route.ts": "OAuth callback: authorized by the signed single-use state, which carries the session and workspace.",
  "auth/instagram/callback/route.ts": "OAuth callback: signed single-use state.",
  "auth/whatsapp/callback/route.ts": "OAuth callback: signed single-use state.",
  "auth/microsoft/callback/route.ts": "OAuth callback: signed single-use state.",
  "auth/dropbox/callback/route.ts": "OAuth callback: signed single-use state.",
  "auth/slack/callback/route.ts": "OAuth callback: signed single-use state.",
  "auth/calendly/callback/route.ts": "OAuth callback: signed single-use state.",
  "auth/stripe/callback/route.ts": "OAuth callback: signed single-use state.",
  "webhooks/stripe/route.ts": "Provider webhook: authorized by Stripe's signature, which carries its own replay window.",
  "webhooks/stripe/connect/route.ts": "Provider webhook: Stripe signature.",
  "webhooks/email/route.ts": "Provider webhook: the inbound email provider's signature.",
  "cron/automations/route.ts": "Scheduled job: authorized by CRON_SECRET.",
};

/** Calls that authorize a webhook or a scheduled job instead of a session. */
const MACHINE_GUARDS = ["verifyMetaSignature(", "verifyCalendlySignature(", "validateRequest(", "constructEvent(", "CRON_SECRET", "verifySeedSecret(", "verifySignature(", "Webhook(", "svix"];

function routeFiles(dir: string, prefix = ""): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir).sort()) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...routeFiles(full, `${prefix}${entry}/`));
    else if (entry === "route.ts") out.push(`${prefix}${entry}`);
  }
  return out;
}

type Fn = { name: string; body: string; exported: boolean };

/** Every function in a file, so a guard reached through a local helper still counts. */
function functionsIn(source: string): Fn[] {
  const marks = [...source.matchAll(/(export )?async function (\w+)/g)];
  return marks.map((m, i) => ({
    name: m[2],
    exported: Boolean(m[1]),
    body: source.slice(m.index!, i + 1 < marks.length ? marks[i + 1].index! : source.length),
  }));
}

/** Does this function guard itself, or call something in the same file that does? */
function guarded(fn: Fn, all: Map<string, Fn>, seen = new Set<string>()): boolean {
  if (seen.has(fn.name)) return false;
  seen.add(fn.name);
  if (GUARDS.some((g) => fn.body.includes(g))) return true;
  for (const [name, other] of all) {
    if (name !== fn.name && new RegExp(`\\b${name}\\s*\\(`).test(fn.body) && guarded(other, all, seen)) return true;
  }
  return false;
}

describe("guard manifest", () => {
  const actionFiles = readdirSync(ACTIONS).filter((f) => f.endsWith(".ts") && !f.includes(".test."));
  const routes = routeFiles(API).filter((r) => !r.startsWith("mobile/"));

  it("finds the server actions and the API routes", () => {
    expect(actionFiles.length).toBeGreaterThan(20);
    expect(routes.length).toBeGreaterThan(10);
  });

  it("every server action resolves the caller's workspace, or says why it does not have to", () => {
    const undecided: string[] = [];
    for (const file of actionFiles) {
      const source = readFileSync(path.join(ACTIONS, file), "utf8");
      const fns = functionsIn(source);
      const byName = new Map(fns.map((f) => [f.name, f]));
      for (const fn of fns.filter((f) => f.exported)) {
        const key = `${file}:${fn.name}`;
        if (PUBLIC_ACTIONS[key]) continue;
        if (!guarded(fn, byName)) undecided.push(key);
      }
    }
    expect(
      undecided,
      `These server actions never resolve who is calling. A server action is a public endpoint: anyone can post to it with any arguments. Either call requireRole or requireBusiness, or add it to PUBLIC_ACTIONS in this file with the reason it is safe.\n  ${undecided.join("\n  ")}`,
    ).toEqual([]);
  });

  it("every API route outside the mobile tree is guarded, or says why it does not have to", () => {
    const undecided = routes.filter((rel) => {
      if (PUBLIC_ROUTES[rel]) return false;
      const source = readFileSync(path.join(API, rel), "utf8");
      return ![...GUARDS, ...MACHINE_GUARDS].some((g) => source.includes(g));
    });
    expect(
      undecided,
      `These API routes have no session guard and no machine guard. Either add one, or add the route to PUBLIC_ROUTES in this file with the reason it is safe.\n  ${undecided.join("\n  ")}`,
    ).toEqual([]);
  });

  it("the exemption lists have not gone stale", () => {
    const actionKeys = new Set<string>();
    for (const file of actionFiles) {
      for (const fn of functionsIn(readFileSync(path.join(ACTIONS, file), "utf8"))) {
        if (fn.exported) actionKeys.add(`${file}:${fn.name}`);
      }
    }
    expect(Object.keys(PUBLIC_ACTIONS).filter((k) => !actionKeys.has(k)), "These actions no longer exist; remove them from PUBLIC_ACTIONS.").toEqual([]);
    expect(Object.keys(PUBLIC_ROUTES).filter((r) => !routes.includes(r)), "These routes no longer exist; remove them from PUBLIC_ROUTES.").toEqual([]);
  });

  it("every exemption carries a real reason, not a placeholder", () => {
    for (const [key, reason] of [...Object.entries(PUBLIC_ACTIONS), ...Object.entries(PUBLIC_ROUTES)]) {
      expect(reason.length, key).toBeGreaterThan(30);
      expect(reason, key).toMatch(/[.!]$/);
    }
  });

  it("catches an action that lost its guard", () => {
    // Proves the walk above can actually fail rather than passing on everything.
    const naked: Fn = { name: "leakEverything", exported: true, body: "export async function leakEverything(businessId: string) { return prisma.client.findMany({ where: { businessId } }); }" };
    expect(guarded(naked, new Map([[naked.name, naked]]))).toBe(false);

    const viaHelper = new Map<string, Fn>([
      ["helper", { name: "helper", exported: false, body: "async function helper() { return requireRole(['OWNER']); }" }],
      ["action", { name: "action", exported: true, body: "export async function action() { const ctx = await helper(); }" }],
    ]);
    expect(guarded(viaHelper.get("action")!, viaHelper)).toBe(true);
  });
});
