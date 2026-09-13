import { founderOgImage, OG_SIZE } from "@/components/founder/ogImage";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Karim Mohamed, Founder of Daythread";

export default function Image() {
  return founderOgImage({ title: "Karim Mohamed", subtitle: "Founder of Daythread" });
}
