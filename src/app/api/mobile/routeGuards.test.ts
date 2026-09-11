import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";

/**
 * Membership is not permission. The mobile API once shipped six routes that authenticated
 * the caller and then answered staff questions for a client portal login, and the reason
 * it happened is that nothing forced a decision: `requireMobileBusiness` reads like a
 * guard, so a new route gets written with it and looks finished.
 *
 * This test forces the decision. Every mobile route must either check a role at its own
 * boundary, or appear below with a written reason. Adding a route without doing one of
 * those fails the suite, which is the point — the reviewer has to say which it is.
 */
const MOBILE_API = path.join(process.cwd(), "src/app/api/mobile");

/** Routes that legitimately do not check a role at the boundary, and why. */
const EXEMPT: Record<string, string> = {
  "auth/login/route.ts": "Public: this is where a session comes from.",
  "auth/signup/route.ts": "Public: creates the account and its first workspace.",
  "auth/forgot/route.ts": "Public: a password reset cannot require being signed in.",
  "me/route.ts": "Any member may ask who they are; it returns only the caller's own identity and role.",
  "workspaces/route.ts": "Any member may list the workspaces they themselves belong to.",
  "account/route.ts": "Any member may read and update their own account.",
  "password/route.ts": "Any member may change their own password.",
  "profile/route.ts": "Any member may edit their own profile.",
  "bookings/route.ts": "Scopes inside the handler by role: a partner sees assigned work, a client only their own.",
  "bookings/[id]/route.ts": "Same per-role scoping as the booking list; an id outside scope answers 404.",
  "bookings/[id]/advance/route.ts": "Delegates to advanceBookingStatus, which calls requireRole before it reads anything.",
};

function routeFiles(dir: string, prefix = ""): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir).sort()) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...routeFiles(full, `${prefix}${entry}/`));
    else if (entry === "route.ts") out.push(`${prefix}${entry}`);
  }
  return out;
}

describe("mobile API guard manifest", () => {
  const files = routeFiles(MOBILE_API);

  it("finds the mobile API", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it("every route either checks a role at its boundary or is exempt for a written reason", () => {
    const undecided = files.filter((rel) => {
      if (EXEMPT[rel]) return false;
      return !readFileSync(path.join(MOBILE_API, rel), "utf8").includes("requireMobileRole(");
    });
    expect(undecided, `These mobile routes authenticate but never check a role. Either call requireMobileRole at the top of the handler, or add the route to EXEMPT in this file with the reason it is safe.\n  ${undecided.join("\n  ")}`).toEqual([]);
  });

  it("the exemption list has not gone stale", () => {
    const gone = Object.keys(EXEMPT).filter((rel) => !files.includes(rel));
    expect(gone, "These routes no longer exist; remove them from EXEMPT.").toEqual([]);
    // An exemption on a route that now checks a role anyway is dead weight, not a risk,
    // but it hides the fact that the route is actually guarded.
    const redundant = Object.keys(EXEMPT).filter((rel) => files.includes(rel) && readFileSync(path.join(MOBILE_API, rel), "utf8").includes("requireMobileRole("));
    expect(redundant, "These routes check a role now; drop the exemption.").toEqual([]);
  });

  it("no mobile route authenticates without resolving a workspace", () => {
    // getSessionFromRequest alone proves who the caller is, not which workspace they are
    // acting in. A route that stops there has to hand the session to something that does.
    const bare = files.filter((rel) => {
      const src = readFileSync(path.join(MOBILE_API, rel), "utf8");
      if (!src.includes("getSessionFromRequest")) return false;
      if (src.includes("requireMobileRole(") || src.includes("requireMobileBusiness(")) return false;
      // Passing the session on to a server action is fine; those call requireRole themselves.
      return !/\bsession\s*\)/.test(src);
    });
    expect(bare, "These routes authenticate but neither resolve a workspace nor delegate the session to something that does.").toEqual([]);
  });
});
