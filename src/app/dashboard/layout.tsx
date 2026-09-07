import "./dashboard.css";
import { redirect } from "next/navigation";
import { getSession, requireBusiness, getUserMemberships } from "@/lib/auth";
import { AppShell } from "./AppShell";
import { Toaster } from "@/components/Toaster";
import { prisma } from "@/lib/db";
import { PLANS, effectivePlan } from "@/lib/billing";
import type { Metadata, Viewport } from "next";

/** The inbox as an installed app: standalone on iPhone, no double-tap zoom on controls,
 * and the safe areas honoured (viewport-fit=cover). */
export const metadata: Metadata = { appleWebApp: { capable: true, statusBarStyle: "default", title: "Daythread" } };
export const viewport: Viewport = { width: "device-width", initialScale: 1, maximumScale: 1, viewportFit: "cover", themeColor: "#FFFFFF" };

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  const ctx = await requireBusiness();
  if (!ctx) redirect("/workspaces");
  const { business, role } = ctx;

  // Defense in depth: a customer-role membership from an older invitation never sees the inbox.
  if (role === "CLIENT") redirect("/workspaces");

  const [memberships, connectedChannels] = await Promise.all([
    getUserMemberships(session.userId),
    prisma.integration.count({ where: { businessId: business.id, status: { in: ["CONNECTED", "SYNC_ERROR", "NEEDS_ATTENTION"] }, provider: { in: ["EMAIL", "INSTAGRAM", "WHATSAPP", "SMS"] } } }),
  ]);
  const workspaces = memberships.map((m) => ({ businessId: m.businessId, name: m.business.name, role: m.role }));

  return (
    <Toaster>
      <AppShell userName={ctx.user.name} businessName={business.name} role={role} plan={PLANS[effectivePlan(business)].name as "Free" | "Pro"} workspaces={workspaces} connectedChannels={connectedChannels}>
        {children}
      </AppShell>
    </Toaster>
  );
}
