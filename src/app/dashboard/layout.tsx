import { redirect } from "next/navigation";
import { getSession, requireBusiness, getUserMemberships } from "@/lib/auth";
import { AppShell } from "./AppShell";

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
  const workspaces = memberships.map((m) => ({ businessId: m.businessId, name: m.business.name, role: m.role }));

  return (
    <AppShell businessName={business.name} handle={business.handle} role={role} workspaces={workspaces}>
      {children}
    </AppShell>
  );
}
