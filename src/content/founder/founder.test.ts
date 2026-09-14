import { describe, it, expect, afterEach, vi } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { allProse, person, daythread, contact } from "./profile";
import { founderProfileGraph, founderIds, serializeJsonLd } from "@/lib/founder/structuredData";

/**
 * The founder profile's rules, as tests: third person only, no status adjectives, no email
 * addresses, no invented profiles, and a Person id the landing page can point at.
 */
const prose = allProse();

describe("founder profile copy", () => {
  it("is written in the third person", () => {
    const firstPerson = /(^|[^A-Za-z’'])(I|I’m|I'm|I’ve|I've|me|my|we|our|us|We|Our|My)(?=$|[^A-Za-z’'])/;
    const offenders = prose.filter((s) => firstPerson.test(s));
    expect(offenders).toEqual([]);
  });

  it("never declares status the evidence has to earn", () => {
    const banned = /world-class|genius|elite|industry-leading|ivy league|visionary|serial entrepreneur|pioneer|rockstar|ninja|guru|thought leader|brilliant|prodigy|best-in-class/i;
    expect(prose.filter((s) => banned.test(s))).toEqual([]);
  });

  it("reads as a profile, not a résumé: no grades, coursework, clubs or activity lists", () => {
    const resume = /\bGPA\b|\bSAT\b|\bPSAT\b|\bAP\s|Bellevue College|coursework|transcript|referee|Chemistry Club|Technology Student Association|Yearbook|extracurricular|\bskills?\b|qualifications/i;
    expect(prose.filter((s) => resume.test(s))).toEqual([]);
  });

  it("stays within the reading budget", () => {
    const words = prose.join(" ").split(/\s+/).filter(Boolean).length;
    expect(words).toBeLessThanOrEqual(1800);
  });

  it("publishes no email address and no invented profile", () => {
    expect(prose.filter((s) => /[\w.+-]+@[\w-]+\.[\w.]+/.test(s))).toEqual([]);
    expect(contact.links.every((l) => /^https:\/\/(github\.com\/karimmoh1-glitch|daythread\.org|therushd\.com)$/.test(l.href))).toBe(true);
  });

  it("only uses a product screenshot that exists in /public", () => {
    const file = path.join(process.cwd(), "public", daythread.screenshot.src);
    expect(statSync(file).size).toBeGreaterThan(10_000);
  });

  it("keeps the page itself free of first-person copy outside the content module", () => {
    const dir = path.join(process.cwd(), "src/app/founder");
    const text = readdirSync(dir).filter((f) => f.endsWith(".tsx")).map((f) => readFileSync(path.join(dir, f), "utf8")).join("\n");
    // JSX text between tags: nothing like ">I build" or ">My ..."
    expect(text).not.toMatch(/>\s*(I|My|We|Our)\s[a-z]/);
  });
});

describe("founder structured data", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("has the exact production Person id and GitHub as the only sameAs", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    const ids = founderIds("https://daythread.org");
    expect(ids.person).toBe("https://daythread.org/founder#person");
    const graph = founderProfileGraph("https://daythread.org")["@graph"];
    const p = graph.find((n) => n["@type"] === "Person")!;
    expect(p.sameAs).toEqual([person.github]);
    expect(p).not.toHaveProperty("image");
    expect(p).not.toHaveProperty("email");
    expect(graph.map((n) => n["@type"])).toEqual(expect.arrayContaining(["WebSite", "Organization", "Person", "ProfilePage", "BreadcrumbList"]));
    const page = graph.find((n) => n["@type"] === "ProfilePage")!;
    expect(page.mainEntity).toEqual({ "@id": ids.person });
  });

  it("serializes safely inside a script tag", () => {
    expect(serializeJsonLd({ a: "</script><script>" })).not.toContain("</script>");
  });
});
