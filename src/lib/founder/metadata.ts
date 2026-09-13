import type { Metadata } from "next";
import { profile } from "@/content/founder/profile";

type Options = {
  /** The full title; used absolutely so the root "· Daythread" template isn't appended twice. */
  title: string;
  description: string;
  path: string;
  type: "profile" | "website" | "article";
  imageAlt: string;
  article?: { publishedTime: string; modifiedTime: string };
};

/**
 * Metadata for a founder route. A page-level openGraph object replaces the root one entirely,
 * so every field (url, siteName, type, images) is set here; the image is the route's
 * co-located opengraph-image.
 */
export function founderMetadata({ title, description, path, type, imageAlt, article }: Options): Metadata {
  const image = { url: `${path}/opengraph-image`, width: 1200, height: 630, alt: imageAlt };
  const base = { title, description, url: path, siteName: "Daythread", images: [image] };
  const openGraph: Metadata["openGraph"] =
    type === "profile"
      ? { ...base, type: "profile", firstName: profile.givenName, lastName: profile.familyName }
      : type === "article"
        ? { ...base, type: "article", publishedTime: article?.publishedTime, modifiedTime: article?.modifiedTime, authors: [profile.path] }
        : { ...base, type: "website" };
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: path },
    authors: [{ name: profile.name, url: profile.path }],
    openGraph,
    twitter: { card: "summary_large_image", title, description, images: [image.url] },
  };
}
