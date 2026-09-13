import { founderOgImage, OG_SIZE } from "@/components/founder/ogImage";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Projects by Karim Mohamed";

export default function Image() {
  return founderOgImage({ eyebrow: "Karim Mohamed", title: "Projects", subtitle: "Daythread, Rushd and InternOps" });
}
