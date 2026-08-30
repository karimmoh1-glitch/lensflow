import { redirect } from "next/navigation";
import { getSession, getUserMemberships } from "@/lib/auth";
import { switchWorkspace } from "@/app/actions/workspace";
import { Card, CardBody } from "@/components/ui";
import { initials } from "@/lib/utils";
import { logout } from "@/app/actions/auth";

export default async function WorkspacesPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const memberships = await getUserMemberships(session.userId);

  if (memberships.length === 0) {
    return (
      <main className="min-h-screen bg-paper flex items-center justify-center px-6">
        <Card className="w-full max-w-sm">
          <CardBody className="p-8 text-center">
            <h1 className="font-display text-xl mb-2">No workspace yet</h1>
            <p className="text-sm text-ink/55 mb-6">This account isn't part of any organization. Ask for an invitation, or create your own studio.</p>
            <form action={logout}>
              <button className="text-sm text-accent-text font-medium">Log out</button>
            </form>
          </CardBody>
        </Card>
      </main>
    );
  }

  if (memberships.length === 1) {
    const m = memberships[0];
    await switchWorkspace(m.businessId);
  }

  return (
    <main className="min-h-screen bg-paper flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-2xl mb-1 text-center">Choose a workspace</h1>
        <p className="text-sm text-ink/50 mb-6 text-center">You belong to more than one organization.</p>
        <Card>
          <div className="divide-y divide-border">
            {memberships.map((m) => (
              <form key={m.businessId} action={switchWorkspace.bind(null, m.businessId)}>
                <button type="submit" className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-black/[0.02]">
                  <div className="w-9 h-9 rounded-full bg-accent-soft text-accent-text flex items-center justify-center text-xs font-semibold shrink-0">
                    {initials(m.business.name)}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{m.business.name}</div>
                    <div className="text-xs text-ink/45">{m.role.charAt(0) + m.role.slice(1).toLowerCase()}</div>
                  </div>
                </button>
              </form>
            ))}
          </div>
        </Card>
      </div>
    </main>
  );
}
