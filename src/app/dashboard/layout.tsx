import { redirect } from "next/navigation";
import { getSession, requireBusiness, getUserMemberships } from "@/lib/auth";
import { AppShell } from "./AppShell";
import { Toaster } from "@/components/Toaster";
import { prisma } from "@/lib/db";
import { PROVIDERS } from "@/lib/integrations/registry";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  const ctx = await requireBusiness();
  if (!ctx) redirect("/workspaces");
  const { business, role } = ctx;

  // Defense in depth: even if a client/partner link ends up pointing at /dashboard,
  // the backend sends them to their own portal rather than the photographer console.
  if (role === "CLIENT") redirect("/portal");
  if (role === "PARTNER") redirect("/partner");

  const memberships = await getUserMemberships(session.userId);
  // Tools the owner said they use during onboarding but hasn't connected yet.
  const wantedRows = await prisma.integration.findMany({ where: { businessId: business.id, wanted: true, status: "NOT_CONNECTED" }, select: { provider: true } });
  const wanted = wantedRows.map((r) => PROVIDERS[r.provider as keyof typeof PROVIDERS]?.name).filter((n): n is string => Boolean(n));
  const workspaces = memberships.map((m) => ({ businessId: m.businessId, name: m.business.name, role: m.role }));

  return (
    <Toaster>
      <AppShell businessName={business.name} handle={business.handle} role={role} workspaces={workspaces} wantedIntegrations={wanted}>
        {children}
      </AppShell>
    </Toaster>
  );
}
