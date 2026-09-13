import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPost, writingStaticParams } from "@/content/founder/writing";
import { profile } from "@/content/founder/profile";
import { founderMetadata } from "@/lib/founder/metadata";
import { articleJsonLd } from "@/lib/founder/structuredData";
import { formatPostDate } from "@/lib/founder/format";
import { JsonLdScript } from "@/components/founder/JsonLdScript";
import { Breadcrumbs } from "@/components/founder/Breadcrumbs";
import { ArrowLink } from "@/components/founder/ui";

// Only posts in src/content/founder/writing.ts exist; any other slug is a 404.
export const dynamicParams = false;

export function generateStaticParams() {
  return writingStaticParams();
}

type Props = { params: { slug: string } };

export function generateMetadata({ params }: Props): Metadata {
  const post = getPost(params.slug);
  if (!post) return {};
  return founderMetadata({
    title: `${post.title} — Karim Mohamed`,
    description: post.description,
    path: `/karim-mohamed/writing/${post.slug}`,
    type: "article",
    imageAlt: post.title,
    article: { publishedTime: post.datePublished, modifiedTime: post.dateModified },
  });
}

export default function WritingPostPage({ params }: Props) {
  const post = getPost(params.slug);
  if (!post) notFound();

  return (
    <article className="mx-auto max-w-[1120px] px-5 pb-20 pt-10 sm:px-6 md:pb-28 md:pt-14">
      <JsonLdScript data={articleJsonLd(post)} />
      <Breadcrumbs
        items={[
          { name: "Karim Mohamed", href: "/karim-mohamed" },
          { name: "Writing", href: "/karim-mohamed/writing" },
          { name: post.title, href: `/karim-mohamed/writing/${post.slug}` },
        ]}
      />
      <header className="mt-10 max-w-[780px]">
        <h1 className="font-serif text-display-md text-ink md:text-display-lg">{post.title}</h1>
        <p className="mt-5 font-serif text-[1.5rem] leading-[1.3] text-ink/80">{post.description}</p>
        <p className="mt-6 text-13 text-ink/65">
          {profile.name} · <time dateTime={post.datePublished}>{formatPostDate(post.datePublished)}</time>
          {post.dateModified !== post.datePublished && (
            <>
              {" "}
              · Updated <time dateTime={post.dateModified}>{formatPostDate(post.dateModified)}</time>
            </>
          )}
        </p>
      </header>

      <div className="mt-12 max-w-[680px] space-y-5 border-t border-border pt-10 text-[1.0625rem] leading-[1.75] text-ink/80">
        {post.body.map((block, i) => {
          switch (block.type) {
            case "heading":
              return (
                <h2 key={i} className="pt-6 font-serif text-display-sm text-ink">
                  {block.text}
                </h2>
              );
            case "list":
              return (
                <ul key={i} className="list-disc space-y-2 pl-5">
                  {block.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              );
            case "quote":
              return (
                <blockquote key={i} className="border-l-2 border-accent pl-5 font-serif text-[1.5rem] italic leading-[1.35] text-ink">
                  {block.text}
                </blockquote>
              );
            default:
              return <p key={i}>{block.text}</p>;
          }
        })}
      </div>

      <div className="mt-16 border-t border-border pt-6">
        <ArrowLink href="/karim-mohamed/writing">All writing</ArrowLink>
      </div>
    </article>
  );
}
