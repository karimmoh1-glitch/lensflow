/**
 * Karim's writing. Empty on purpose: the routes, metadata and Article JSON-LD are ready, and a
 * post appears (and is added to the sitemap) the moment one is written here. Never add
 * placeholder posts.
 */

export type WritingBlock =
  | { type: "paragraph"; text: string }
  | { type: "heading"; text: string }
  | { type: "list"; items: string[] }
  | { type: "quote"; text: string };

export type WritingPost = {
  slug: string;
  title: string;
  description: string;
  /** ISO date, e.g. "2026-09-13". */
  datePublished: string;
  dateModified: string;
  body: WritingBlock[];
};

export const posts: readonly WritingPost[] = [];

/** The params for /karim-mohamed/writing/[slug]; the page exports these as generateStaticParams. */
export function writingStaticParams(): { slug: string }[] {
  return posts.map((p) => ({ slug: p.slug }));
}

export function getPost(slug: string): WritingPost | undefined {
  return posts.find((p) => p.slug === slug);
}

/** Newest first. */
export function sortedPosts(list: readonly WritingPost[] = posts): WritingPost[] {
  return [...list].sort((a, b) => b.datePublished.localeCompare(a.datePublished));
}
