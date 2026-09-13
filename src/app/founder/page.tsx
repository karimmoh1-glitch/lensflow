import { permanentRedirect } from "next/navigation";

/** /founder is a convenience alias; the canonical founder page is /karim-mohamed. */
export default function FounderRedirect() {
  permanentRedirect("/karim-mohamed");
}
