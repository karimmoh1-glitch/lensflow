import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { BookingFlow } from "./BookingFlow";
import { initials } from "@/lib/utils";

/** Every business's booking page is their actual public storefront — search results and
 * shared links should show their name and bio, not generic Daythread site-wide branding. */
export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }): Promise<Metadata> {
  const { handle } = await params;
  const business = await prisma.business.findUnique({ where: { handle }, select: { name: true, bio: true } });
  if (!business) return {};
  const description = business.bio ?? `Book with ${business.name} on Daythread.`;
  return {
    title: `${business.name} — Book now`,
    description,
    openGraph: { title: `${business.name} — Book now`, description },
  };
}

export default async function PublicBookingPage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const business = await prisma.business.findUnique({
    where: { handle },
    include: { services: { where: { active: true }, orderBy: { sortOrder: "asc" } } },
  });
  if (!business) notFound();

  return (
    <main className="min-h-screen bg-paper">
      <div className="max-w-2xl mx-auto px-6 py-14">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-12 h-12 rounded-full bg-accent-soft text-accent-text flex items-center justify-center font-semibold shrink-0">
            {initials(business.name)}
          </div>
          <div>
            <h1 className="font-display text-2xl">{business.name}</h1>
            {business.specialties.length > 0 && <p className="text-xs text-ink/65">{business.specialties.join(" · ")}</p>}
          </div>
        </div>
        {business.bio && <p className="text-sm text-ink/60 mb-8 max-w-lg">{business.bio}</p>}

        <BookingFlow
          handle={business.handle}
          depositPercent={business.depositPercent}
          services={business.services.map((s) => ({ id: s.id, name: s.name, priceCents: s.priceCents, durationMins: s.durationMins }))}
        />
      </div>
    </main>
  );
}
