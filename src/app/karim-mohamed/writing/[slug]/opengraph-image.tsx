import { founderOgImage, OG_SIZE } from "@/components/founder/ogImage";
import { getPost } from "@/content/founder/writing";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Writing by Karim Mohamed";

export default function Image({ params }: { params: { slug: string } }) {
  const post = getPost(params.slug);
  return founderOgImage({ eyebrow: "Karim Mohamed · Writing", title: post?.title ?? "Writing", subtitle: "Founder of Daythread" });
}
