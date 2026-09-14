/**
 * JSON-LD for the founder profile, as pure functions over the content module so the graph can
 * be tested without rendering. In production the base is https://daythread.org, which makes
 * the Person @id exactly https://daythread.org/founder#person — the id the landing page's
 * Organization points at as its founder.
 */
import { person, pattern } from "@/content/founder/profile";

type Node = Record<string, unknown>;
export type JsonLd = { "@context": "https://schema.org"; "@graph": Node[] };

/** Read at call time so tests can change the environment. */
export function siteBase(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "https://daythread.org").replace(/\/+$/, "");
}

export function founderIds(base = siteBase()) {
  const page = `${base}${person.path}`;
  return { website: `${base}/#website`, org: `${base}/#org`, person: `${page}#person`, profile: `${page}#profile`, breadcrumb: `${page}#breadcrumb`, rushd: `${page}#rushd` };
}

/** Serialize for a <script type="application/ld+json">: `<` escaped so content can't close the tag. */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export function founderProfileGraph(base = siteBase()): JsonLd {
  const ids = founderIds(base);
  const url = `${base}${person.path}`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebSite", "@id": ids.website, name: "Daythread", url: base },
      { "@type": "Organization", "@id": ids.org, name: "Daythread", url: base, logo: `${base}/icon`, founder: { "@id": ids.person } },
      {
        "@type": "Person",
        "@id": ids.person,
        name: person.name,
        givenName: person.givenName,
        familyName: person.familyName,
        url,
        description: person.description,
        jobTitle: person.jobTitle,
        worksFor: { "@id": ids.org },
        homeLocation: { "@type": "Place", name: person.location },
        knowsAbout: [...person.knowsAbout],
        sameAs: [person.github],
      },
      { "@type": "SoftwareApplication", "@id": ids.rushd, name: "Rushd", url: pattern.projects[0].link.href, applicationCategory: "EducationalApplication", creator: { "@id": ids.person } },
      { "@type": "ProfilePage", "@id": ids.profile, url, name: `${person.name} — Profile`, mainEntity: { "@id": ids.person }, isPartOf: { "@id": ids.website }, breadcrumb: { "@id": ids.breadcrumb } },
      {
        "@type": "BreadcrumbList",
        "@id": ids.breadcrumb,
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Daythread", item: base },
          { "@type": "ListItem", position: 2, name: person.name, item: url },
        ],
      },
    ],
  };
}
