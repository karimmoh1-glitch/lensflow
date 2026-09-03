"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Inbox as InboxIcon,
  CalendarDays,
  ClipboardCheck,
  Users,
  UserCog,
  CreditCard,
  Zap,
  Sparkles,
  Settings as SettingsIcon,
  Receipt,
  ExternalLink,
  LogOut,
  Menu,
  X,
  type LucideIcon,
} from "lucide-react";
import { logout } from "@/app/actions/auth";
import { initials } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { Role } from "@prisma/client";
import { WorkspaceSwitcher, type WorkspaceOption } from "@/app/dashboard/WorkspaceSwitcher";

// Icon tone shows only in the item's resting state (active state is always solid ink/white
// for clear legibility) — the same terracotta/signal/semantic language used on the
// marketing site's module showcase, so the two feel like one product.
const BASE_NAV: { href: string; label: string; icon: LucideIcon; tone: string; roles?: Role[] }[] = [
  { href: "/dashboard", label: "Home", icon: Home, tone: "text-ink/45" },
  { href: "/dashboard/inbox", label: "Inbox", icon: InboxIcon, tone: "text-signal-text/70" },
  { href: "/dashboard/calendar", label: "Calendar", icon: CalendarDays, tone: "text-success/70" },
  { href: "/dashboard/bookings", label: "Bookings", icon: ClipboardCheck, tone: "text-info/70" },
  { href: "/dashboard/clients", label: "Clients", icon: Users, tone: "text-accent/70" },
  { href: "/dashboard/payments", label: "Payments", icon: CreditCard, tone: "text-warning/70" },
  { href: "/dashboard/automations", label: "Automations", icon: Zap, tone: "text-signal-text/70" },
  { href: "/dashboard/copilot", label: "Copilot", icon: Sparkles, tone: "text-signal-text/70" },
  { href: "/dashboard/team", label: "Team", icon: UserCog, tone: "text-ink/45", roles: ["OWNER", "ADMIN"] },
  { href: "/dashboard/billing", label: "Billing", icon: Receipt, tone: "text-ink/45", roles: ["OWNER", "ADMIN"] },
  { href: "/dashboard/settings", label: "Settings", icon: SettingsIcon, tone: "text-ink/45", roles: ["OWNER", "ADMIN"] },
];

function isActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname.startsWith(href);
}

function NavLinks({ pathname, role, onNavigate }: { pathname: string; role: Role; onNavigate?: () => void }) {
  const items = BASE_NAV.filter((item) => !item.roles || item.roles.includes(role));
  return (
    <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
      {items.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active ? "bg-ink text-white" : "text-ink/60 hover:bg-black/[0.05] hover:text-ink"
            )}
          >
            <item.icon className={cn("w-4 h-4 shrink-0", !active && item.tone)} strokeWidth={2} aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function AccountFooter({
  businessName,
  handle,
  workspaces,
}: {
  businessName: string;
  handle: string;
  workspaces: WorkspaceOption[];
}) {
  return (
    <div className="px-3 py-4 border-t border-border space-y-3">
      <Link
        href={`/book/${handle}`}
        target="_blank"
        className="flex items-center gap-1.5 text-xs text-accent-text font-medium px-3 hover:underline"
      >
        View booking page
        <ExternalLink className="w-3 h-3" strokeWidth={2} aria-hidden />
      </Link>
      {workspaces.length > 1 && <WorkspaceSwitcher current={businessName} workspaces={workspaces} />}
      <div className="flex items-center gap-2 px-3">
        <div className="w-8 h-8 rounded-full bg-accent-soft text-accent-text flex items-center justify-center text-xs font-semibold shrink-0">
          {initials(businessName)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium truncate">{businessName}</div>
          <form action={logout}>
            <button className="flex items-center gap-1 text-xs text-ink/40 hover:text-ink/70">
              <LogOut className="w-3 h-3" strokeWidth={2} aria-hidden />
              Log out
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export function AppShell({
  businessName,
  handle,
  role,
  workspaces = [],
  children,
}: {
  businessName: string;
  handle: string;
  role: Role;
  workspaces?: WorkspaceOption[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const visibleNav = BASE_NAV.filter((item) => !item.roles || item.roles.includes(role));
  const current = visibleNav.find((item) => isActive(pathname, item.href));

  return (
    <div className="min-h-screen bg-paper md:flex">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-56 shrink-0 border-r border-border bg-white flex-col">
        <div className="px-5 py-5 border-b border-border">
          <Link href="/dashboard" className="font-display text-lg text-ink">
            Daythread
          </Link>
          <div className="text-xs text-ink/45 mt-0.5 truncate">{businessName}</div>
        </div>
        <NavLinks pathname={pathname} role={role} />
        <AccountFooter businessName={businessName} handle={handle} workspaces={workspaces} />
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden sticky top-0 z-30 flex items-center justify-between h-14 px-4 border-b border-border bg-white">
        <button
          aria-label="Open navigation"
          onClick={() => setMobileOpen(true)}
          className="w-9 h-9 -ml-2 flex items-center justify-center rounded-md text-ink/60 hover:bg-black/[0.05]"
        >
          <Menu className="w-5 h-5" strokeWidth={2} />
        </button>
        <span className="text-sm font-medium text-ink">{current?.label ?? "Daythread"}</span>
        <div className="w-9 h-9 rounded-full bg-accent-soft text-accent-text flex items-center justify-center text-[11px] font-semibold">
          {initials(businessName)}
        </div>
      </div>

      {/* Mobile nav drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/30" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-64 bg-white flex flex-col shadow-popover">
            <div className="flex items-center justify-between px-5 py-5 border-b border-border">
              <span className="font-display text-lg text-ink">Daythread</span>
              <button
                aria-label="Close navigation"
                onClick={() => setMobileOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-md text-ink/50 hover:bg-black/[0.05]"
              >
                <X className="w-4.5 h-4.5" strokeWidth={2} />
              </button>
            </div>
            <NavLinks pathname={pathname} role={role} onNavigate={() => setMobileOpen(false)} />
            <AccountFooter businessName={businessName} handle={handle} workspaces={workspaces} />
          </div>
        </div>
      )}

      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}
