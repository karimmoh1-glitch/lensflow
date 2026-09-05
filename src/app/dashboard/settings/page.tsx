import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { BusinessProfileForm } from "./BusinessProfileForm";
import { ServicesEditor } from "./ServicesEditor";
import { AvailabilityEditor } from "./AvailabilityEditor";
import { PaymentSettingsForm } from "./PaymentSettingsForm";
import { IntegrationsSection } from "./IntegrationsSection";
import { SettingsTabs } from "./SettingsTabs";
import { DangerZone } from "./DangerZone";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; google_connected?: string; google_error?: string; connected?: string; connect_error?: string; provider?: string }>;
}) {
  const ctx = await requireRole(["OWNER", "ADMIN"]);
  if (!ctx) redirect("/dashboard");
  const { business } = ctx;
  const { tab, google_connected, google_error, connected, connect_error, provider } = await searchParams;

  const [services, availability] = await Promise.all([
    prisma.service.findMany({ where: { businessId: business.id }, orderBy: { sortOrder: "asc" } }),
    prisma.availability.findMany({ where: { businessId: business.id } }),
  ]);

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-8 py-6 md:py-10">
      <PageHeader title="Settings" />
      <SettingsTabs
        initialTab={tab === "connections" || connected || connect_error ? "Connections" : undefined}
        profile={
          <>
            <BusinessProfileForm business={business} />
            {ctx.role === "OWNER" && <DangerZone businessName={business.name} />}
          </>
        }
        services={
          <ServicesEditor initialServices={services.map((s) => ({ id: s.id, name: s.name, priceCents: s.priceCents, durationMins: s.durationMins }))} />
        }
        availability={
          <AvailabilityEditor initialWindows={availability.map((a) => ({ weekday: a.weekday, startMin: a.startMin, endMin: a.endMin }))} />
        }
        payments={<PaymentSettingsForm business={business} />}
        connections={<IntegrationsSection business={business} connected={connected ?? (google_connected === "1" ? "EMAIL" : undefined)} connectError={connect_error ?? google_error} errorProvider={provider} />}
      />
    </div>
  );
}
