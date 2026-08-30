import { redirect } from "next/navigation";
import { getSession, requireBusiness } from "@/lib/auth";
import { logout } from "@/app/actions/auth";
import { initials } from "@/lib/utils";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  const ctx = await requireBusiness();
  if (!ctx) redirect("/workspaces");

  // Defense in depth — a client account must never reach the studio console or partner portal.
  if (ctx.role !== "CLIENT") redirect(ctx.role === "PARTNER" ? "/partner" : "/dashboard");

  const { business } = ctx;

  return (
    <div className="min-h-screen bg-paper">
      <header className="sticky top-0 z-30 flex items-center justify-between h-16 px-5 md:px-8 border-b border-border bg-white">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-accent-soft text-accent-text flex items-center justify-center text-xs font-semibold shrink-0">
            {initials(business.name)}
          </div>
          <span className="font-display text-base text-ink">{business.name}</span>
        </div>
        <form action={logout}>
          <button className="text-xs text-ink/45 hover:text-ink/70">Log out</button>
        </form>
      </header>
      <main>{children}</main>
    </div>
  );
}
