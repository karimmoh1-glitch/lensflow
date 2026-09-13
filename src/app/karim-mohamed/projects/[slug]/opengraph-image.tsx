import { founderOgImage, OG_SIZE } from "@/components/founder/ogImage";
import { getProject, projectStaticParams } from "@/content/founder/projects";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "A project by Karim Mohamed";

export function generateStaticParams() {
  return projectStaticParams();
}

export default function Image({ params }: { params: { slug: string } }) {
  const project = getProject(params.slug);
  return founderOgImage({ eyebrow: "Karim Mohamed · Projects", title: project?.name ?? "Projects", subtitle: project?.tagline ?? "Karim Mohamed" });
}
