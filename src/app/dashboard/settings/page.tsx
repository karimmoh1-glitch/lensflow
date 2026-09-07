import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { ChannelsHub } from "./ChannelsHub";
import { SettingsTabs, type SettingsTab } from "./SettingsTabs";
import { ProfileForm } from "./ProfileForm";
import { DangerZone } from "./DangerZone";
import { PasswordForm } from "./PasswordForm";
import { TeamPanel } from "./TeamPanel";
import { SubscriptionPanel } from "./SubscriptionPanel";

type Params = { tab?: string; google_connected?: string; google_error?: string; connected?: string; connect_error?: string; provider?: string; checkout?: string; plan?: string };

/**
 * Settings: the channels connected to this inbox, your profile, security, the Daythread
 * subscription, and (on Pro) the team sharing the inbox. The tab lives in the URL so a
 * provider's callback, a Stripe return and a teammate's link all land on the right panel.
 */
export default async function SettingsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const ctx = await requireRole(["OWNER", "ADMIN"]);
  if (!ctx) redirect("/dashboard/inbox");
  const { business } = ctx;
  const sp = await searchParams;
  const tab: SettingsTab =
    sp.tab === "profile" ? "profile"
    : sp.tab === "security" ? "security"
    : sp.tab === "subscription" || sp.checkout ? "subscription"
    : sp.tab === "team" ? "team"
    : "channels";

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-8 py-6 md:py-10">
      <PageHeader title="Settings" />
      <SettingsTabs
        active={tab}
        channels={<ChannelsHub business={business} role={ctx.role} connected={sp.connected ?? (sp.google_connected === "1" ? "EMAIL" : undefined)} connectError={sp.connect_error ?? sp.google_error} errorProvider={sp.provider} />}
        profile={
          <>
            <ProfileForm name={ctx.user.name} email={ctx.user.email} workspaceName={business.name} timezone={business.timezone} />
            {ctx.role === "OWNER" && <DangerZone businessName={business.name} />}
          </>
        }
        security={<PasswordForm email={ctx.user.email} />}
        subscription={<SubscriptionPanel business={business} role={ctx.role} checkout={sp.checkout} plan={sp.plan} />}
        team={<TeamPanel business={business} />}
      />
    </div>
  );
}
