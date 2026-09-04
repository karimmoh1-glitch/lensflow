import { redirect } from "next/navigation";
import { getSession, getUserMemberships, homeRouteFor } from "@/lib/auth";
import { switchWorkspace } from "@/app/actions/workspace";
import { initials } from "@/lib/utils";
import { logout } from "@/app/actions/auth";
import { AuthShell } from "@/components/auth/AuthShell";

export default async function WorkspacesPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const memberships = await getUserMemberships(session.userId);

  if (memberships.length === 0) {
    return (
      <AuthShell eyebrow="No workspace yet" title="This account isn't part of a business yet." lede="Ask the owner for an invitation, or start your own thread.">
        <div className="flex flex-col gap-3">
          <a href="/signup/create" className="inline-flex items-center justify-center h-11 px-5 rounded-full bg-ink text-white text-sm font-semibold transition-transform hover:scale-[1.03] active:scale-[0.97]">
            Start my own
          </a>
          <form action={logout}>
            <button className="text-sm font-semibold text-ink/60 hover:text-ink transition-colors">Log out</button>
          </form>
        </div>
      </AuthShell>
    );
  }

  if (memberships.length === 1) {
    // Next.js forbids setting a cookie from a Server Component's render, even when the
    // call is routed through a nested "use server" function — so we can't call
    // switchWorkspace() here. Redirecting without setting activeBusinessId is safe:
    // requireBusiness() already auto-selects it on the next request when there's only
    // one membership to choose from.
    const m = memberships[0];
    redirect(homeRouteFor(m.role, m.business));
  }

  return (
    <AuthShell eyebrow="Workspaces" title="Which business today?" lede="You're part of more than one.">
      <ul className="space-y-2">
        {memberships.map((m) => (
          <li key={m.businessId}>
            <form action={switchWorkspace.bind(null, m.businessId)}>
              <button
                type="submit"
                className="group w-full flex items-center gap-3 px-4 py-3.5 text-left rounded-2xl border border-border bg-white transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:border-ink/25 hover:-translate-y-0.5 hover:shadow-popover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
              >
                <span className="w-10 h-10 rounded-full bg-accent-soft text-accent-text flex items-center justify-center text-xs font-extrabold shrink-0">{initials(m.business.name)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-ink truncate">{m.business.name}</span>
                  <span className="block text-xs text-ink/55">{m.role.charAt(0) + m.role.slice(1).toLowerCase()}</span>
                </span>
                <span aria-hidden className="text-ink/30 transition-all duration-200 group-hover:text-ink group-hover:translate-x-0.5">→</span>
              </button>
            </form>
          </li>
        ))}
      </ul>
      <form action={logout} className="mt-6">
        <button className="text-sm font-semibold text-ink/50 hover:text-ink transition-colors">Log out</button>
      </form>
    </AuthShell>
  );
}
