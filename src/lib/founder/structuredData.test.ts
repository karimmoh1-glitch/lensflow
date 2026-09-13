import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  articleJsonLd,
  founderIds,
  founderProfileJsonLd,
  projectJsonLd,
  serializeJsonLd,
  siteBase,
} from "./structuredData";
import { projects } from "@/content/founder/projects";
import type { WritingPost } from "@/content/founder/writing";

const saved = process.env.NEXT_PUBLIC_APP_URL;
beforeEach(() => {
  delete process.env.NEXT_PUBLIC_APP_URL;
});
afterEach(() => {
  if (saved === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
  else process.env.NEXT_PUBLIC_APP_URL = saved;
});

type N = Record<string, unknown>;
const byType = (graph: N[], type: string) => graph.filter((n) => n["@type"] === type);

describe("founder profile graph", () => {
  it("uses the production base when NEXT_PUBLIC_APP_URL is unset", () => {
    expect(siteBase()).toBe("https://daythread.org");
    expect(founderIds().person).toBe("https://daythread.org/karim-mohamed#person");
  });

  it("strips a trailing slash from the base", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://daythread.org/";
    expect(founderIds().person).toBe("https://daythread.org/karim-mohamed#person");
  });

  it("links WebSite, Organization, Person, Rushd, ProfilePage and BreadcrumbList by @id", () => {
    const { "@graph": graph } = founderProfileJsonLd();
    const [website] = byType(graph, "WebSite");
    const [org] = byType(graph, "Organization");
    const [person] = byType(graph, "Person");
    const [rushd] = byType(graph, "SoftwareApplication");
    const [profilePage] = byType(graph, "ProfilePage");
    const [crumbs] = byType(graph, "BreadcrumbList");

    expect(website["@id"]).toBe("https://daythread.org/#website");
    expect(org["@id"]).toBe("https://daythread.org/#org");
    expect(org.founder).toEqual({ "@id": "https://daythread.org/karim-mohamed#person" });
    expect(person).toMatchObject({
      "@id": "https://daythread.org/karim-mohamed#person",
      name: "Karim Mohamed",
      url: "https://daythread.org/karim-mohamed",
      jobTitle: "Founder",
      worksFor: { "@id": "https://daythread.org/#org" },
      homeLocation: { "@type": "Place", name: "Seattle area" },
      sameAs: ["https://github.com/karimmoh1-glitch"],
    });
    expect(person).not.toHaveProperty("image");
    expect(Array.isArray(person.knowsAbout)).toBe(true);
    expect(rushd).toMatchObject({ name: "Rushd", url: "https://therushd.com", creator: { "@id": person["@id"] } });
    expect(profilePage).toMatchObject({
      "@id": "https://daythread.org/karim-mohamed#profile",
      mainEntity: { "@id": person["@id"] },
      isPartOf: { "@id": website["@id"] },
      breadcrumb: { "@id": crumbs["@id"] },
    });
    expect(crumbs.itemListElement).toEqual([
      { "@type": "ListItem", position: 1, name: "Daythread", item: "https://daythread.org" },
      { "@type": "ListItem", position: 2, name: "Karim Mohamed", item: "https://daythread.org/karim-mohamed" },
    ]);
  });

  it("builds a breadcrumb for every project", () => {
    for (const p of projects) {
      const graph = projectJsonLd(p)["@graph"];
      const [crumbs] = byType(graph, "BreadcrumbList");
      const items = crumbs.itemListElement as N[];
      expect(items.at(-1)).toMatchObject({ name: p.name, item: `https://daythread.org/karim-mohamed/projects/${p.slug}` });
    }
  });
});

describe("article graph", () => {
  // Synthetic post — exists only in this test, never in content.
  const post: WritingPost = {
    slug: "test-post",
    title: "A test post </script><script>alert(1)</script>",
    description: "Only used by the test.",
    datePublished: "2026-09-01",
    dateModified: "2026-09-02",
    body: [{ type: "paragraph", text: "Hello." }],
  };

  it("renders Article and BreadcrumbList from the model", () => {
    const graph = articleJsonLd(post)["@graph"];
    const [article] = byType(graph, "Article");
    const [crumbs] = byType(graph, "BreadcrumbList");
    expect(article).toMatchObject({
      headline: post.title,
      description: post.description,
      datePublished: "2026-09-01",
      dateModified: "2026-09-02",
      url: "https://daythread.org/karim-mohamed/writing/test-post",
      author: { "@id": "https://daythread.org/karim-mohamed#person" },
      publisher: { "@id": "https://daythread.org/#org" },
    });
    expect((crumbs.itemListElement as N[]).map((i) => i.name)).toEqual(["Daythread", "Karim Mohamed", "Writing", post.title]);
  });

  it("serializes safely for a script tag and round-trips", () => {
    const data = articleJsonLd(post);
    const out = serializeJsonLd(data);
    expect(out).not.toContain("<");
    expect(JSON.parse(out)).toEqual(data);
  });
});
