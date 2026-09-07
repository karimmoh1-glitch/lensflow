import { redirect } from "next/navigation";

/** Pricing lives on the landing page; the bare URL still works from links and memory. */
export default function PricingPage() {
  redirect("/#pricing");
}
