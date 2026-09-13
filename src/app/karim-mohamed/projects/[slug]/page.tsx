import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getProject, projectStaticParams, projects } from "@/content/founder/projects";
import { founderMetadata } from "@/lib/founder/metadata";
import { projectJsonLd } from "@/lib/founder/structuredData";
import { JsonLdScript } from "@/components/founder/JsonLdScript";
import { Breadcrumbs } from "@/components/founder/Breadcrumbs";
import { ArrowLink, Prose, SubHeading, focusRing } from "@/components/founder/ui";
import { cn } from "@/lib/utils";

export const dynamicParams = false;

export function generateStaticParams() {
  return projectStaticParams();
}

type Props = { params: { slug: string } };

export function generateMetadata({ params }: Props): Metadata {
  const project = getProject(params.slug);
  if (!project) return {};
  return founderMetadata({
    title: `${project.name} — a project by Karim Mohamed`,
    description: project.description,
    path: `/karim-mohamed/projects/${project.slug}`,
    type: "website",
    imageAlt: `${project.name}, a project by Karim Mohamed`,
  });
}

export default function ProjectPage({ params }: Props) {
  const project = getProject(params.slug);
  if (!project) notFound();
  const others = projects.filter((p) => p.slug !== project.slug);

  const facts: { term: string; value: React.ReactNode }[] = [
    { term: "Role", value: project.role },
    ...(project.status ? [{ term: "Status", value: project.status }] : []),
    { term: "Site", value: <ArrowLink href={project.site.url} className="min-h-6 font-normal [overflow-wrap:anywhere]">{project.site.label}</ArrowLink> },
    {
      term: "Repository",
      value: (
        <ArrowLink href={project.repository.url} className="min-h-6 font-normal [overflow-wrap:anywhere]">
          {project.repository.label.split("/").map((part, i) => (
            <span key={part}>
              {i > 0 && (
                <>
                  /<wbr />
                </>
              )}
              {part}
            </span>
          ))}
        </ArrowLink>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-[1120px] px-5 pb-20 pt-10 sm:px-6 md:pb-28 md:pt-14">
      <JsonLdScript data={projectJsonLd(project)} />
      <Breadcrumbs
        items={[
          { name: "Karim Mohamed", href: "/karim-mohamed" },
          { name: "Projects", href: "/karim-mohamed/projects" },
          { name: project.name, href: `/karim-mohamed/projects/${project.slug}` },
        ]}
      />

      <div className="mt-10 grid gap-10 md:grid-cols-[minmax(0,1fr)_300px] md:gap-16">
        <div>
          <h1 className="font-serif text-display-lg text-ink md:text-display-xl">{project.name}</h1>
          <p className="mt-5 max-w-[30ch] font-serif text-[1.625rem] leading-[1.25] text-ink/80 md:text-display-sm">{project.summary}</p>
        </div>
        <dl className="self-end border-t border-border-strong text-sm">
          {facts.map((f) => (
            <div key={f.term} className="grid grid-cols-[96px_minmax(0,1fr)] items-baseline gap-3 border-b border-border py-2.5">
              <dt className="text-13 text-ink/65">{f.term}</dt>
              <dd className="min-w-0 text-ink">{f.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="mt-16 max-w-[680px] space-y-12 md:mt-20">
        <section aria-labelledby="what-title">
          <h2 id="what-title" className="font-serif text-display-sm text-ink">What it is</h2>
          <Prose paragraphs={project.whatItIs} className="mt-4" />
        </section>

        <section aria-labelledby="problem-title">
          <h2 id="problem-title" className="font-serif text-display-sm text-ink">The problem</h2>
          <Prose paragraphs={[project.problem]} className="mt-4" />
        </section>

        {project.quote && (
          <section aria-labelledby="quote-title">
            <h2 id="quote-title" className="font-serif text-display-sm text-ink">{project.quote.label}</h2>
            <blockquote className="mt-5 border-l-2 border-accent pl-5">
              <p className="font-serif text-display-sm italic text-ink">{project.quote.text}</p>
            </blockquote>
          </section>
        )}

        {project.list && (
          <section aria-labelledby="list-title">
            <h2 id="list-title" className="font-serif text-display-sm text-ink">{project.list.label}</h2>
            <ul className="mt-4 grid grid-cols-2 gap-x-8 sm:grid-cols-3">
              {project.list.items.map((item) => (
                <li key={item} className="border-t border-border py-2.5 text-sm text-ink/80">
                  {item}
                </li>
              ))}
            </ul>
          </section>
        )}

        {project.notes.length > 0 && <Prose paragraphs={project.notes} className="text-sm text-ink/65" />}
      </div>

      <nav aria-labelledby="more-title" className="mt-20 border-t border-border pt-10">
        <SubHeading id="more-title">Other projects</SubHeading>
        <ul className="mt-4 grid gap-6 sm:grid-cols-2">
          {others.map((p) => (
            <li key={p.slug}>
              <Link href={`/karim-mohamed/projects/${p.slug}`} className={cn("group block py-1", focusRing)}>
                <span className="font-serif text-display-sm text-ink group-hover:underline underline-offset-4">{p.name}</span>
                <span className="mt-1 block text-sm text-ink/65">{p.summary}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
