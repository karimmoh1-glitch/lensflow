import { redirect } from "next/navigation";

/** Stripe's success/cancel and portal return URLs point here; the subscription lives under
 * Settings now, so carry the query across. */
export default async function BillingPage({ searchParams }: { searchParams: Promise<{ checkout?: string; plan?: string }> }) {
  const sp = await searchParams;
  const params = new URLSearchParams({ tab: "subscription" });
  if (sp.checkout) params.set("checkout", sp.checkout);
  if (sp.plan) params.set("plan", sp.plan);
  redirect(`/dashboard/settings?${params.toString()}`);
}
