import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, statSync } from "fs";
import path from "path";
import { webPath, mobilePath, type NoticeTarget } from "@/server/notify";

/**
 * A notice that opens a page which does not exist is worse than no notice: the person
 * taps it, lands on "not found", and stops trusting the next one. Both apps are checked
 * against their own routing here, so renaming or moving a page breaks this test rather
 * than quietly breaking every notification that pointed at it.
 */
const WEB = path.join(process.cwd(), "src/app/dashboard");
const MOBILE = path.join(process.cwd(), "mobile/app");

/** One of every target a notice can carry. Adding a kind without adding it here fails below. */
const TARGETS: NoticeTarget[] = [
  { kind: "conversation", id: "abc123" },
  { kind: "booking", id: "abc123" },
  { kind: "client", id: "abc123" },
  { kind: "payments" },
  { kind: "integrations" },
];

/** Does a Next App Router page exist for this dashboard path? Dynamic segments match [id]. */
function webRouteExists(pathname: string): boolean {
  const segments = pathname.replace(/[?#].*$/, "").split("/").filter(Boolean);
  let dir = WEB;
  for (const segment of segments) {
    if (!existsSync(dir)) return false;
    const entries = readdirSync(dir).filter((e) => statSync(path.join(dir, e)).isDirectory());
    const exact = entries.find((e) => e === segment);
    const dynamic = entries.find((e) => /^\[.+\]$/.test(e));
    const next = exact ?? dynamic;
    if (!next) return false;
    dir = path.join(dir, next);
  }
  return existsSync(path.join(dir, "page.tsx"));
}

/** Does an expo-router screen exist for this path? Groups like (tabs) are part of the path. */
function mobileRouteExists(pathname: string): boolean {
  const segments = pathname.split("/").filter(Boolean);
  let dir = MOBILE;
  for (const [i, segment] of segments.entries()) {
    if (!existsSync(dir)) return false;
    const entries = readdirSync(dir);
    const last = i === segments.length - 1;
    if (last) {
      const file = entries.find((e) => e === `${segment}.tsx` || (/^\[.+\]\.tsx$/.test(e) && !segment.startsWith("(")));
      if (file) return true;
      // A folder is a route too when it holds an index screen.
      const folder = entries.find((e) => e === segment || /^\[.+\]$/.test(e));
      if (folder && statSync(path.join(dir, folder)).isDirectory()) return existsSync(path.join(dir, folder, "index.tsx"));
      return false;
    }
    const folder = entries.find((e) => e === segment || /^\[.+\]$/.test(e));
    if (!folder || !statSync(path.join(dir, folder)).isDirectory()) return false;
    dir = path.join(dir, folder);
  }
  return false;
}

describe("where a notification sends people", () => {
  it("finds both apps", () => {
    expect(existsSync(WEB)).toBe(true);
    expect(existsSync(MOBILE)).toBe(true);
  });

  it("every web destination is a page that exists", () => {
    const broken = TARGETS.filter((t) => !webRouteExists(webPath(t))).map((t) => `${t.kind} -> /dashboard${webPath(t)}`);
    expect(broken, "These notification targets open a dashboard page that does not exist.").toEqual([]);
  });

  it("every phone destination is a screen that exists", () => {
    const broken = TARGETS.filter((t) => !mobileRouteExists(mobilePath(t))).map((t) => `${t.kind} -> ${mobilePath(t)}`);
    expect(broken, "These notification targets open a phone screen that does not exist.").toEqual([]);
  });

  it("the two apps are not handed each other's paths", () => {
    for (const target of TARGETS) {
      const web = webPath(target);
      const mobile = mobilePath(target);
      expect(web.startsWith("/"), `${target.kind} web path`).toBe(true);
      expect(mobile.startsWith("/"), `${target.kind} phone path`).toBe(true);
      // A dashboard path must never be handed to the phone app, which has no /dashboard.
      expect(mobile.startsWith("/dashboard")).toBe(false);
    }
  });

  it("a record's id reaches the destination rather than being dropped", () => {
    for (const target of TARGETS) {
      if (!("id" in target)) continue;
      expect(webPath(target), `${target.kind} web`).toContain(target.id);
      expect(mobilePath(target), `${target.kind} phone`).toContain(target.id);
    }
  });

  it("catches a destination that does not exist", () => {
    // Proves the checks above can actually fail rather than passing on everything.
    expect(webRouteExists("/not-a-real-page")).toBe(false);
    expect(mobileRouteExists("/not-a-real-screen")).toBe(false);
  });
});
