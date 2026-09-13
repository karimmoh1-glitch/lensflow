import Link from "next/link";
import { sortedPosts } from "@/content/founder/writing";
import { founderMetadata } from "@/lib/founder/metadata";
import { writingIndexJsonLd } from "@/lib/founder/structuredData";
import { JsonLdScript } from "@/components/founder/JsonLdScript";
import { Breadcrumbs } from "@/components/founder/Breadcrumbs";
import { ArrowLink, focusRing } from "@/components/founder/ui";
import { formatPostDate } from "@/lib/founder/format";
import { cn } from "@/lib/utils";

export const metadata = founderMetadata({
  title: "Writing — Karim Mohamed",
  description: "Writing by Karim Mohamed, founder of Daythread and creator of Rushd.",
  path: "/karim-mohamed/writing",
  type: "website",
  imageAlt: "Writing by Karim Mohamed",
});

export default function WritingIndexPage() {
  const posts = sortedPosts();
  return (
    <div className="mx-auto max-w-[1120px] px-5 pb-20 pt-10 sm:px-6 md:pb-28 md:pt-14">
      <JsonLdScript data={writingIndexJsonLd()} />
      <Breadcrumbs items={[{ name: "Karim Mohamed", href: "/karim-mohamed" }, { name: "Writing", href: "/karim-mohamed/writing" }]} />
      <h1 className="mt-10 font-serif text-display-lg text-ink md:text-display-xl">Writing</h1>

      {posts.length === 0 ? (
        <div className="mt-14 max-w-[680px] border-t border-border-strong pt-8 md:mt-20">
          <p className="font-serif text-display-sm text-ink/80">Writing will appear here.</p>
          <div className="mt-6 flex flex-wrap gap-x-6">
            <ArrowLink href="/karim-mohamed/projects">See the projects</ArrowLink>
            <ArrowLink href="/karim-mohamed">About Karim</ArrowLink>
          </div>
        </div>
      ) : (
        <ol className="mt-14 max-w-[680px] border-t border-border-strong md:mt-20">
          {posts.map((post) => (
            <li key={post.slug} className="border-b border-border py-8">
              <p className="text-13 text-ink/65">
                <time dateTime={post.datePublished}>{formatPostDate(post.datePublished)}</time>
              </p>
              <h2 className="mt-2 font-serif text-display-sm text-ink">
                <Link href={`/karim-mohamed/writing/${post.slug}`} className={cn("hover:underline underline-offset-4", focusRing)}>
                  {post.title}
                </Link>
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-ink/80">{post.description}</p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
