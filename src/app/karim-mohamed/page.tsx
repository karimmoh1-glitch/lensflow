import Image from "next/image";
import Link from "next/link";
import { profile } from "@/content/founder/profile";
import { projects } from "@/content/founder/projects";
import { sortedPosts } from "@/content/founder/writing";
import { recognitionGroups } from "@/content/founder/recognition";
import { timeline } from "@/content/founder/timeline";
import { founderProfileJsonLd } from "@/lib/founder/structuredData";
import { founderMetadata } from "@/lib/founder/metadata";
import { JsonLdScript } from "@/components/founder/JsonLdScript";
import { ArrowLink, FounderSection, Prose, Sequence, SubHeading, focusRing } from "@/components/founder/ui";
import { cn } from "@/lib/utils";

export const metadata = founderMetadata({
  title: "Karim Mohamed — Founder of Daythread",
  description: profile.description,
  path: profile.path,
  type: "profile",
  imageAlt: "Karim Mohamed, Founder of Daythread",
});

/**
 * Karim Mohamed's page. Every sentence comes from src/content/founder; nothing here is
 * fetched at request time, so the page is static and fully readable without JavaScript.
 */
export default function KarimMohamedPage() {
  const posts = sortedPosts();
  const groups = recognitionGroups();

  return (
    <>
      <JsonLdScript data={founderProfileJsonLd()} />
      <div className="mx-auto max-w-[1120px] px-5 sm:px-6">
        {/* Hero */}
        <div className={cn("pb-14 pt-14 md:pb-20 md:pt-24", profile.portrait && "grid gap-10 md:grid-cols-[minmax(0,1fr)_320px] md:items-end")}>
          <div>
            <h1 className="font-serif text-display-lg text-ink md:text-display-xl">{profile.name}</h1>
            <p className="mt-6 max-w-[38ch] font-serif text-[1.625rem] leading-[1.25] text-ink/80 md:text-display-sm md:leading-[1.2]">{profile.positioning}</p>
            <p className="mt-8 flex flex-wrap items-center gap-x-2 gap-y-1 text-13 text-ink/65">
              {profile.metaLine.map((m, i) => (
                <span key={m} className="inline-flex items-center gap-x-2">
                  {i > 0 && <span aria-hidden className="text-ink/40">·</span>}
                  {m}
                </span>
              ))}
            </p>
            <ul className="mt-4 flex flex-wrap gap-x-6" aria-label="Links">
              {profile.heroLinks.map((l) => (
                <li key={l.href}>
                  <ArrowLink href={l.href}>{l.label}</ArrowLink>
                </li>
              ))}
            </ul>
          </div>
          {profile.portrait && (
            <Image src={profile.portrait.src} alt={profile.portrait.alt} width={profile.portrait.width} height={profile.portrait.height} className="w-full rounded-lg border border-border" priority />
          )}
        </div>

        <FounderSection id="builder" title="The builder">
          <Prose paragraphs={profile.builder.paragraphs} />

          <div className="mt-12">
            <SubHeading id="loop-title">How I build</SubHeading>
            <ol aria-labelledby="loop-title" className="mt-4 grid grid-cols-2 border-l border-t border-border sm:grid-cols-3 lg:grid-cols-6">
              {profile.builder.loop.map((step, i) => (
                <li key={step} className="flex min-h-[72px] flex-col justify-between gap-3 sm:min-h-[88px] border-b border-r border-border p-3">
                  <span className="text-2xs tabular-nums text-ink/65">{String(i + 1).padStart(2, "0")}</span>
                  <span className="text-sm font-medium text-ink">{step}</span>
                </li>
              ))}
            </ol>
            <p className="mt-3 text-13 text-ink/65">
              <span aria-hidden>↺ </span>
              {profile.builder.loopNote}
            </p>
          </div>

          <div className="mt-10">
            <SubHeading>The whole system</SubHeading>
            <p className="mt-1 text-13 text-ink/65">What I want to understand, end to end.</p>
            <div className="mt-4">
              <Sequence steps={profile.builder.wholeSystem} label="From software to business" />
            </div>
          </div>
        </FounderSection>

        <FounderSection id="daythread" title="Daythread" lead="Founder and builder">
          <Prose paragraphs={profile.daythread.paragraphs} />
          <blockquote className="mt-8 max-w-[680px] border-l-2 border-accent pl-5">
            <p className="font-serif text-display-sm italic text-ink">{profile.daythread.idea}</p>
          </blockquote>
          <div className="mt-10">
            <SubHeading id="areas-title">{profile.daythread.areasIntro}</SubHeading>
            <ul aria-labelledby="areas-title" className="mt-4 grid max-w-[680px] grid-cols-2 gap-x-8 sm:grid-cols-4">
              {profile.daythread.areas.map((a) => (
                <li key={a} className="border-t border-border py-2.5 text-sm text-ink/80">
                  {a}
                </li>
              ))}
            </ul>
          </div>
          <p className="mt-8 text-sm text-ink/80">{profile.daythread.focus}</p>
          <div className="mt-3 flex flex-wrap gap-x-6">
            <ArrowLink href="https://daythread.org">daythread.org</ArrowLink>
            <ArrowLink href="/karim-mohamed/projects/daythread">About the project</ArrowLink>
          </div>
        </FounderSection>

        <FounderSection id="built" title="What I've built">
          <ul className="grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((p) => (
              <li key={p.slug} className="flex flex-col border-t border-border-strong pt-5">
                <h3 className="font-serif text-display-sm text-ink">
                  <Link href={`/karim-mohamed/projects/${p.slug}`} className={cn("hover:underline decoration-ink/30 underline-offset-4", focusRing)}>
                    {p.name}
                  </Link>
                </h3>
                <p className="mt-1 text-xs text-ink/65">{p.role}</p>
                <p className="mt-3 text-sm leading-relaxed text-ink/80">{p.summary}</p>
                {p.status && <p className="mt-3 text-xs text-ink/65">{p.status}</p>}
                <div className="mt-auto flex flex-wrap gap-x-5 pt-3">
                  <ArrowLink href={`/karim-mohamed/projects/${p.slug}`}>
                    More<span className="sr-only"> about {p.name}</span>
                  </ArrowLink>
                  <ArrowLink href={p.site.url}>
                    Visit<span className="sr-only"> {p.name}</span>
                  </ArrowLink>
                </div>
              </li>
            ))}
          </ul>
        </FounderSection>

        <FounderSection id="in-public" title="Building in public">
          <Prose paragraphs={profile.buildingInPublic} />
          <ul className="mt-6 max-w-[680px] border-t border-border">
            {projects.map((p) => (
              <li key={p.slug} className="border-b border-border">
                <a href={p.repository.url} className={cn("group flex min-h-12 items-center justify-between gap-4 py-2 text-sm", focusRing)}>
                  <span className="text-ink">
                    {p.name}
                    <span className="sr-only"> repository on GitHub</span>
                  </span>
                  <span className="flex min-w-0 items-center gap-2 font-mono text-xs text-ink/65 group-hover:text-ink">
                    <span className="truncate">github.com/{p.repository.label}</span>
                    <span aria-hidden>↗</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
          <div className="mt-4">
            <ArrowLink href={profile.github.profile}>All repositories on GitHub</ArrowLink>
          </div>
        </FounderSection>

        <FounderSection id="interests" title="Interests" lead="Software and hardware, and where they meet">
          <Prose paragraphs={profile.interests.ambition} />

          <div className="mt-12 grid gap-10 lg:grid-cols-2 lg:gap-12">
            <div>
              <SubHeading id="ce-title">Computer engineering</SubHeading>
              <ul aria-labelledby="ce-title" className="mt-4 border-t border-border">
                {profile.interests.computerEngineering.map((i) => (
                  <li key={i} className="border-b border-border py-2.5 text-sm text-ink/80">
                    {i}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <SubHeading id="lt-title">Longer term</SubHeading>
              <ul aria-labelledby="lt-title" className="mt-4 border-t border-border">
                {profile.interests.longTerm.map((i) => (
                  <li key={i} className="border-b border-border py-2.5 text-sm text-ink/80">
                    {i}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="mt-12">
            <SubHeading>Robotics, from the software side</SubHeading>
            <p className="mt-2 max-w-[680px] text-sm leading-relaxed text-ink/80">{profile.interests.robotics.intro}:</p>
            <div className="mt-4">
              <Sequence steps={profile.interests.robotics.steps} label="What a machine needs to do" numbered />
            </div>
            <p className="mt-5 max-w-[680px] text-sm leading-relaxed text-ink/80">{profile.interests.robotics.note}</p>
          </div>
        </FounderSection>

        <FounderSection id="writing" title="Writing">
          {posts.length === 0 ? (
            <p className="text-[1.0625rem] text-ink/65">Writing will appear here.</p>
          ) : (
            <ul className="max-w-[680px] border-t border-border">
              {posts.slice(0, 5).map((post) => (
                <li key={post.slug} className="border-b border-border py-4">
                  <Link href={`/karim-mohamed/writing/${post.slug}`} className={cn("font-serif text-[1.375rem] text-ink hover:underline underline-offset-4", focusRing)}>
                    {post.title}
                  </Link>
                  <p className="mt-1 text-sm text-ink/65">{post.description}</p>
                </li>
              ))}
            </ul>
          )}
        </FounderSection>

        <FounderSection id="timeline" title="Timeline">
          <ol className="max-w-[680px] border-t border-border">
            {timeline.map((t) => (
              <li key={t.title} className="grid gap-1 border-b border-border py-4 sm:grid-cols-[170px_minmax(0,1fr)] sm:gap-6">
                {t.when ? <p className="text-13 text-ink/65">{t.when}</p> : <span aria-hidden className="hidden sm:block" />}
                <div>
                  <h3 className="text-sm font-medium text-ink">
                    {t.href ? (
                      <Link href={t.href} className={cn("hover:underline underline-offset-4", focusRing)}>
                        {t.title}
                      </Link>
                    ) : (
                      t.title
                    )}
                  </h3>
                  <p className="mt-0.5 text-sm text-ink/80">{t.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </FounderSection>

        <FounderSection id="currently" title="Currently">
          <ul className="space-y-3">
            {profile.currently.map((c) => (
              <li key={c} className="flex items-center gap-3 font-serif text-display-sm text-ink">
                <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                {c}
              </li>
            ))}
          </ul>
        </FounderSection>

        {groups.length > 0 && (
          <FounderSection id="recognition" title="Recognition">
            <div className="max-w-[680px] space-y-8">
              {groups.map((g) => (
                <div key={g.kind}>
                  <SubHeading id={`rec-${g.kind}`}>{g.label}</SubHeading>
                  <ul aria-labelledby={`rec-${g.kind}`} className="mt-3 border-t border-border">
                    {g.items.map((item) => (
                      <li key={item.title} className="border-b border-border py-3 text-sm text-ink/80">
                        <span className="text-ink">{item.title}</span>
                        <span aria-hidden className="text-ink/40"> — </span>
                        <span className="sr-only">: </span>
                        {item.detail}
                        {item.year && <span className="text-ink/65"> · {item.year}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </FounderSection>
        )}

        <FounderSection id="contact" title="Contact">
          <p className="max-w-[680px] text-[1.0625rem] leading-[1.7] text-ink/80">{profile.contact}</p>
          <div className="mt-4 flex flex-wrap gap-x-6">
            <ArrowLink href="/support">Daythread support</ArrowLink>
            <ArrowLink href={profile.github.profile}>GitHub</ArrowLink>
          </div>
        </FounderSection>
      </div>
    </>
  );
}
