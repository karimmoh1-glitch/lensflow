import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { profile } from "./profile";
import { projectStaticParams, projects } from "./projects";
import { posts, writingStaticParams } from "./writing";
import { recognition } from "./recognition";
import { timeline } from "./timeline";
import { founderIds, founderProfileJsonLd } from "@/lib/founder/structuredData";

const BANNED = ["world-renowned", "visionary", "serial entrepreneur", "AI pioneer", "youngest CEO", "thought leader", "rockstar", "ninja", "guru", "disrupt"];
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === "object") return Object.values(value).flatMap(strings);
  return [];
}

const content = strings({ profile, projects, posts, recognition, timeline });

const SRC = path.resolve(__dirname, "../..");
function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? filesUnder(p) : /\.(ts|tsx)$/.test(f) && !/\.test\.ts$/.test(f) ? [p] : [];
  });
}
const sourceFiles = [
  ...filesUnder(path.join(SRC, "app/karim-mohamed")),
  ...filesUnder(path.join(SRC, "components/founder")),
  ...filesUnder(path.join(SRC, "content/founder")),
  ...filesUnder(path.join(SRC, "lib/founder")),
  path.join(SRC, "app/founder/page.tsx"),
];

const savedBase = process.env.NEXT_PUBLIC_APP_URL;
afterEach(() => {
  if (savedBase === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
  else process.env.NEXT_PUBLIC_APP_URL = savedBase;
});

describe("founder content invariants", () => {
  it("collects a meaningful amount of copy", () => {
    expect(content.length).toBeGreaterThan(50);
  });

  it.each(BANNED)("never uses %s — in content or in page source", (word) => {
    const re = new RegExp(word.replace(/[-\s]/g, "[-\\s]?"), "i");
    expect(content.filter((s) => re.test(s))).toEqual([]);
    // The one place the list is allowed to appear is this test.
    expect(sourceFiles.filter((f) => re.test(readFileSync(f, "utf8")))).toEqual([]);
  });

  it("contains no email address", () => {
    expect(content.filter((s) => EMAIL.test(s))).toEqual([]);
    expect(sourceFiles.filter((f) => EMAIL.test(readFileSync(f, "utf8")))).toEqual([]);
  });

  it("links only the verified GitHub profile as sameAs", () => {
    expect(profile.sameAs).toEqual(["https://github.com/karimmoh1-glitch"]);
    const person = founderProfileJsonLd("https://daythread.org")["@graph"].find((n) => n["@type"] === "Person");
    expect(person?.sameAs).toEqual(["https://github.com/karimmoh1-glitch"]);
  });

  it("has no press, speaking or interviews, and only the stated hackathon placing under awards", () => {
    expect(recognition.press).toEqual([]);
    expect(recognition.speaking).toEqual([]);
    expect(recognition.interviews).toEqual([]);
    expect(recognition.awards).toEqual([{ title: "EdAI hackathon", detail: "Team placed second", year: null, url: null }]);
  });

  it("has no portrait until a real photo is added", () => {
    expect(profile.portrait).toBeNull();
  });

  it("has no writing posts yet", () => {
    expect(posts).toEqual([]);
    expect(writingStaticParams()).toEqual([]);
  });

  it("gives the Person the exact production @id", () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    expect(founderIds().person).toBe("https://daythread.org/karim-mohamed#person");
  });

  it("statically generates every project slug, and unknown slugs 404", () => {
    expect(projectStaticParams().map((p) => p.slug).sort()).toEqual(projects.map((p) => p.slug).sort());
    // The pages can't be imported here (JSX), so check their wiring in source.
    for (const route of ["projects", "writing"]) {
      const page = readFileSync(path.join(SRC, `app/karim-mohamed/${route}/[slug]/page.tsx`), "utf8");
      const helper = route === "projects" ? "projectStaticParams" : "writingStaticParams";
      expect(page).toMatch(new RegExp(`export function generateStaticParams\\(\\) \\{\\s*return ${helper}\\(\\);`));
      expect(page).toContain("export const dynamicParams = false;");
    }
    expect(projects.map((p) => p.slug).sort()).toEqual(["daythread", "internops", "rushd"]);
  });

  it("dates nothing except Daythread's 2026 repository", () => {
    const years = content.flatMap((s) => s.match(/\b(19|20)\d{2}\b/g) ?? []);
    expect(new Set(years)).toEqual(new Set(["2026"]));
  });
});
