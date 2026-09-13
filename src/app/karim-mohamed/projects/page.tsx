import Link from "next/link";
import { projects } from "@/content/founder/projects";
import { founderMetadata } from "@/lib/founder/metadata";
import { projectsIndexJsonLd } from "@/lib/founder/structuredData";
import { JsonLdScript } from "@/components/founder/JsonLdScript";
import { Breadcrumbs } from "@/components/founder/Breadcrumbs";
import { ArrowLink, focusRing } from "@/components/founder/ui";
import { cn } from "@/lib/utils";

export const metadata = founderMetadata({
  title: "Projects — Karim Mohamed",
  description: "What Karim Mohamed has built: Daythread, business software for service businesses; Rushd, academic planning for high-school students; and InternOps, an internship-management platform.",
  path: "/karim-mohamed/projects",
  type: "website",
  imageAlt: "Projects by Karim Mohamed",
});

export default function ProjectsIndexPage() {
  return (
    <div className="mx-auto max-w-[1120px] px-5 pb-20 pt-10 sm:px-6 md:pb-28 md:pt-14">
      <JsonLdScript data={projectsIndexJsonLd()} />
      <Breadcrumbs items={[{ name: "Karim Mohamed", href: "/karim-mohamed" }, { name: "Projects", href: "/karim-mohamed/projects" }]} />
      <h1 className="mt-10 font-serif text-display-lg text-ink md:text-display-xl">Projects</h1>
      <p className="mt-5 max-w-[34ch] font-serif text-[1.625rem] leading-[1.25] text-ink/80 md:text-display-sm">Three things I&rsquo;ve built.</p>

      <ol className="mt-14 border-t border-border-strong md:mt-20">
        {projects.map((p) => (
          <li key={p.slug} className="grid gap-4 border-b border-border py-10 md:grid-cols-[220px_minmax(0,1fr)_220px] md:gap-12">
            <div>
              <h2 className="font-serif text-display-md text-ink">
                <Link href={`/karim-mohamed/projects/${p.slug}`} className={cn("hover:underline decoration-ink/30 underline-offset-[6px]", focusRing)}>
                  {p.name}
                </Link>
              </h2>
              <p className="mt-2 text-xs text-ink/65">{p.role}</p>
            </div>
            <div className="max-w-[560px]">
              <p className="text-[1.0625rem] leading-[1.7] text-ink/80">{p.summary}</p>
              {p.status && <p className="mt-3 text-13 text-ink/65">{p.status}</p>}
            </div>
            <div className="flex flex-col items-start">
              <ArrowLink href={`/karim-mohamed/projects/${p.slug}`}>
                Read more<span className="sr-only"> about {p.name}</span>
              </ArrowLink>
              <ArrowLink href={p.site.url}>
                Visit site<span className="sr-only">: {p.site.label}</span>
              </ArrowLink>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
