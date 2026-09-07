import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { BusinessProfileForm } from "./BusinessProfileForm";
import { ServicesEditor } from "./ServicesEditor";
import { AvailabilityEditor } from "./AvailabilityEditor";
import { IntegrationsHub } from "./IntegrationsHub";
import { SettingsTabs, type SettingsTab } from "./SettingsTabs";
import { DangerZone } from "./DangerZone";
import { PasswordForm } from "./PasswordForm";
import { ProfileForm } from "./ProfileForm";
import { NotificationsPanel } from "./NotificationsPanel";
import { SubscriptionPanel } from "./SubscriptionPanel";
import { TeamPanel } from "./TeamPanel";

type Params = { tab?: string; google_connected?: string; google_error?: string; connected?: string; connect_error?: string; provider?: string; setup?: string; checkout?: string; plan?: string; interval?: string };

/**
 * Settings: the channels and calendars connected to this workspace, the business (name,
 * services, hours — what bookings are built from), your profile, notifications, security,
 * the Daythread subscription, and the team. The tab lives in the URL so a provider's
 * callback, a Stripe return and a teammate's link all land on the right panel.
 */
export default async function SettingsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const ctx = await requireRole(["OWNER", "ADMIN"]);
  if (!ctx) redirect("/dashboard");
  const { business } = ctx;
  const sp = await searchParams;
  const tab: SettingsTab =
    sp.tab === "business" ? "business"
    : sp.tab === "profile" ? "profile"
    : sp.tab === "notifications" ? "notifications"
    : sp.tab === "security" ? "security"
    : sp.tab === "subscription" || sp.checkout ? "subscription"
    : sp.tab === "team" ? "team"
    : "channels"; // includes the legacy ?tab=connections and every provider callback

  const [services, availability] = await Promise.all([
    prisma.service.findMany({ where: { businessId: business.id }, orderBy: { sortOrder: "asc" } }),
    prisma.availability.findMany({ where: { businessId: business.id } }),
  ]);

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-8 py-6 md:py-10">
      <PageHeader title="Settings" />
      <SettingsTabs
        active={tab}
        panels={{
          channels: <IntegrationsHub business={business} role={ctx.role} connected={sp.connected ?? (sp.google_connected === "1" ? "EMAIL" : undefined)} connectError={sp.connect_error ?? sp.google_error} errorProvider={sp.provider} />,
          business: (
            <div className="space-y-8">
              <BusinessProfileForm business={business} />
              <ServicesEditor initialServices={services.map((s) => ({ id: s.id, name: s.name, priceCents: s.priceCents, durationMins: s.durationMins }))} />
              <AvailabilityEditor initialWindows={availability.map((a) => ({ weekday: a.weekday, startMin: a.startMin, endMin: a.endMin }))} />
            </div>
          ),
          profile: (
            <>
              <ProfileForm name={ctx.user.name} email={ctx.user.email} workspaceName={business.name} timezone={business.timezone} />
              {ctx.role === "OWNER" && <DangerZone businessName={business.name} />}
            </>
          ),
          notifications: <NotificationsPanel business={business} />,
          security: <PasswordForm email={ctx.user.email} />,
          subscription: <SubscriptionPanel business={business} role={ctx.role} checkout={sp.checkout} plan={sp.plan} interval={sp.interval} />,
          team: <TeamPanel business={business} role={ctx.role} />,
        }}
      />
    </div>
  );
}
