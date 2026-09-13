/**
 * JSON-LD for the founder pages. Pure functions over the content modules, so the graph can be
 * tested without rendering. Every URL is absolute and derived from one base; in production the
 * base is https://daythread.org, which makes the Person @id exactly
 * https://daythread.org/karim-mohamed#person — the id the landing page's Organization points
 * at as its founder.
 */
import { profile } from "@/content/founder/profile";
import { projects, type Project } from "@/content/founder/projects";
import type { WritingPost } from "@/content/founder/writing";

type Node = Record<string, unknown>;
export type JsonLd = { "@context": "https://schema.org"; "@graph": Node[] };

/** Read at call time so tests can change the environment. */
export function siteBase(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "https://daythread.org").replace(/\/+$/, "");
}

export function founderIds(base = siteBase()) {
  const page = `${base}${profile.path}`;
  return {
    website: `${base}/#website`,
    org: `${base}/#org`,
    person: `${page}#person`,
    profilePage: `${page}#profile`,
    profileBreadcrumb: `${page}#breadcrumb`,
    rushd: `${page}/projects/rushd#software`,
  };
}

/** Serialize for a <script type="application/ld+json">: `<` escaped so content can't close the tag. */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

type Crumb = { name: string; path: string };

function breadcrumbList(base: string, crumbs: Crumb[], id?: string): Node {
  return {
    "@type": "BreadcrumbList",
    ...(id ? { "@id": id } : {}),
    itemListElement: crumbs.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: c.path === "/" ? base : `${base}${c.path}`,
    })),
  };
}

export const ROOT_CRUMBS: Crumb[] = [
  { name: "Daythread", path: "/" },
  { name: profile.name, path: profile.path },
];

export function websiteNode(base = siteBase()): Node {
  return { "@type": "WebSite", "@id": founderIds(base).website, name: "Daythread", url: base };
}

function personNode(base: string): Node {
  const ids = founderIds(base);
  return {
    "@type": "Person",
    "@id": ids.person,
    name: profile.name,
    givenName: profile.givenName,
    familyName: profile.familyName,
    url: `${base}${profile.path}`,
    description: profile.description,
    jobTitle: profile.jobTitle,
    worksFor: { "@id": ids.org },
    homeLocation: { "@type": "Place", name: profile.location },
    knowsAbout: profile.interests.computerEngineering,
    sameAs: profile.sameAs,
    // A portrait is only described once a real photo exists.
    ...(profile.portrait ? { image: `${base}${profile.portrait.src}` } : {}),
  };
}

/** The whole graph for /karim-mohamed. */
export function founderProfileJsonLd(base = siteBase()): JsonLd {
  const ids = founderIds(base);
  const rushd = projects.find((p) => p.slug === "rushd");
  return {
    "@context": "https://schema.org",
    "@graph": [
      websiteNode(base),
      {
        "@type": "Organization",
        "@id": ids.org,
        name: "Daythread",
        url: base,
        logo: `${base}/icon`,
        founder: { "@id": ids.person },
      },
      personNode(base),
      ...(rushd
        ? [
            {
              "@type": "SoftwareApplication",
              "@id": ids.rushd,
              name: rushd.name,
              url: rushd.site.url,
              description: rushd.summary,
              applicationCategory: rushd.applicationCategory,
              operatingSystem: "Web",
              creator: { "@id": ids.person },
            },
          ]
        : []),
      {
        "@type": "ProfilePage",
        "@id": ids.profilePage,
        url: `${base}${profile.path}`,
        name: `${profile.name} — Founder of Daythread`,
        mainEntity: { "@id": ids.person },
        isPartOf: { "@id": ids.website },
        breadcrumb: { "@id": ids.profileBreadcrumb },
      },
      breadcrumbList(base, ROOT_CRUMBS, ids.profileBreadcrumb),
    ],
  };
}

export function projectsIndexJsonLd(base = siteBase()): JsonLd {
  return {
    "@context": "https://schema.org",
    "@graph": [breadcrumbList(base, [...ROOT_CRUMBS, { name: "Projects", path: `${profile.path}/projects` }])],
  };
}

export function projectJsonLd(project: Project, base = siteBase()): JsonLd {
  const ids = founderIds(base);
  const path = `${profile.path}/projects/${project.slug}`;
  const app: Node = {
    "@type": "SoftwareApplication",
    ...(project.slug === "rushd" ? { "@id": ids.rushd } : {}),
    name: project.name,
    url: project.site.url,
    description: project.summary,
    applicationCategory: project.applicationCategory,
    operatingSystem: "Web",
    creator: { "@id": ids.person },
    ...(project.slug === "daythread" ? { publisher: { "@id": ids.org } } : {}),
  };
  return {
    "@context": "https://schema.org",
    "@graph": [
      app,
      breadcrumbList(base, [
        ...ROOT_CRUMBS,
        { name: "Projects", path: `${profile.path}/projects` },
        { name: project.name, path },
      ]),
    ],
  };
}

export function writingIndexJsonLd(base = siteBase()): JsonLd {
  return {
    "@context": "https://schema.org",
    "@graph": [breadcrumbList(base, [...ROOT_CRUMBS, { name: "Writing", path: `${profile.path}/writing` }])],
  };
}

export function articleJsonLd(post: WritingPost, base = siteBase()): JsonLd {
  const ids = founderIds(base);
  const url = `${base}${profile.path}/writing/${post.slug}`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        "@id": `${url}#article`,
        headline: post.title,
        description: post.description,
        datePublished: post.datePublished,
        dateModified: post.dateModified,
        url,
        mainEntityOfPage: url,
        author: { "@id": ids.person },
        publisher: { "@id": ids.org },
        isPartOf: { "@id": ids.website },
      },
      breadcrumbList(base, [
        ...ROOT_CRUMBS,
        { name: "Writing", path: `${profile.path}/writing` },
        { name: post.title, path: `${profile.path}/writing/${post.slug}` },
      ]),
    ],
  };
}
