import type { MetadataRoute } from "next";
import { prisma } from "@/lib/db";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://daythread.org";

// Regenerate hourly rather than only on redeploy — new businesses finish onboarding
// between deploys and should show up in search without waiting for the next push.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: BASE_URL, changeFrequency: "weekly", priority: 1 },
    { url: `${BASE_URL}/signup`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE_URL}/login`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${BASE_URL}/demo`, changeFrequency: "monthly", priority: 0.5 },
  ];

  // Each completed-onboarding business has a real public booking page — that's Daythread's
  // actual public storefront per customer, and worth being discoverable on its own.
  const businesses = await prisma.business.findMany({
    where: { onboardingComplete: true },
    select: { handle: true, updatedAt: true },
    take: 5000,
  });

  const bookingRoutes: MetadataRoute.Sitemap = businesses.map((b) => ({
    url: `${BASE_URL}/book/${b.handle}`,
    lastModified: b.updatedAt,
    changeFrequency: "weekly",
    priority: 0.6,
  }));

  return [...staticRoutes, ...bookingRoutes];
}
