import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { BookingFlow } from "./BookingFlow";
import { initials } from "@/lib/utils";

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
            {business.specialties.length > 0 && <p className="text-xs text-ink/45">{business.specialties.join(" · ")}</p>}
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
