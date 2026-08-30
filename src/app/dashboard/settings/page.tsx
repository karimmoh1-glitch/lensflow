import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { BusinessProfileForm } from "./BusinessProfileForm";
import { ServicesEditor } from "./ServicesEditor";
import { AvailabilityEditor } from "./AvailabilityEditor";
import { PaymentSettingsForm } from "./PaymentSettingsForm";
import { ConnectionsSection } from "./ConnectionsSection";
import { SettingsTabs } from "./SettingsTabs";

export default async function SettingsPage() {
  const ctx = await requireRole(["OWNER", "ADMIN"]);
  if (!ctx) redirect("/dashboard");
  const { business } = ctx;

  const [services, availability] = await Promise.all([
    prisma.service.findMany({ where: { businessId: business.id }, orderBy: { sortOrder: "asc" } }),
    prisma.availability.findMany({ where: { businessId: business.id } }),
  ]);

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-8 py-6 md:py-10">
      <PageHeader title="Settings" />
      <SettingsTabs
        profile={<BusinessProfileForm business={business} />}
        services={
          <ServicesEditor initialServices={services.map((s) => ({ id: s.id, name: s.name, priceCents: s.priceCents, durationMins: s.durationMins }))} />
        }
        availability={
          <AvailabilityEditor initialWindows={availability.map((a) => ({ weekday: a.weekday, startMin: a.startMin, endMin: a.endMin }))} />
        }
        payments={<PaymentSettingsForm business={business} />}
        connections={<ConnectionsSection business={business} />}
      />
    </div>
  );
}
