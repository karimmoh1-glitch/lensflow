"use client";

import { useEffect, useRef, useState } from "react";
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
import { LogoMark } from "@/components/Logo";
import { CommandPalette } from "./CommandPalette";
import { Search } from "lucide-react";

// Icon tone shows only in the item's resting state (active state is always solid ink/white
// for clear legibility) — the same terracotta/signal/semantic language used on the
// marketing site's module showcase, so the two feel like one product.
const BASE_NAV: { href: string; label: string; icon: LucideIcon; tone: string; roles?: Role[] }[] = [
  { href: "/dashboard", label: "Home", icon: Home, tone: "text-ink/65" },
  { href: "/dashboard/inbox", label: "Inbox", icon: InboxIcon, tone: "text-signal-text/70" },
  { href: "/dashboard/calendar", label: "Calendar", icon: CalendarDays, tone: "text-success/70" },
  { href: "/dashboard/bookings", label: "Bookings", icon: ClipboardCheck, tone: "text-info/70" },
  { href: "/dashboard/clients", label: "Clients", icon: Users, tone: "text-accent/70" },
  { href: "/dashboard/payments", label: "Payments", icon: CreditCard, tone: "text-warning/70" },
  { href: "/dashboard/automations", label: "Automations", icon: Zap, tone: "text-signal-text/70" },
  { href: "/dashboard/copilot", label: "Copilot", icon: Sparkles, tone: "text-signal-text/70" },
  { href: "/dashboard/team", label: "Team", icon: UserCog, tone: "text-ink/65", roles: ["OWNER", "ADMIN"] },
  { href: "/dashboard/billing", label: "Billing", icon: Receipt, tone: "text-ink/65", roles: ["OWNER", "ADMIN"] },
  { href: "/dashboard/settings", label: "Settings", icon: SettingsIcon, tone: "text-ink/65", roles: ["OWNER", "ADMIN"] },
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
              "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
              active ? "bg-ink text-white" : "text-ink/60 hover:bg-black/[0.05] hover:text-ink hover:translate-x-0.5"
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
            <button className="flex items-center gap-1 text-xs text-ink/60 hover:text-ink/70">
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
  const drawerRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  // Focus management for the mobile drawer: move focus in on open, trap Tab within it so
  // keyboard users can't tab into the page content hidden behind the overlay, close on
  // Escape, and return focus to the button that opened it — the same contract any modal
  // dialog needs, not just a visual overlay.
  useEffect(() => {
    if (!mobileOpen) return;
    const drawer = drawerRef.current;
    const menuButton = menuButtonRef.current;
    const focusable = drawer?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input, [tabindex]:not([tabindex="-1"])');
    focusable?.[0]?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setMobileOpen(false);
        return;
      }
      if (e.key !== "Tab" || !focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      menuButton?.focus();
    };
  }, [mobileOpen]);

  return (
    <div className="min-h-screen bg-paper md:flex">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-56 shrink-0 border-r border-border bg-white flex-col">
        <div className="px-5 py-5 border-b border-border">
          <Link href="/dashboard" className="inline-flex items-center gap-2 text-ink">
            <LogoMark className="w-5 h-5" />
            <span className="font-sans font-extrabold text-[17px] tracking-tight">Daythread</span>
          </Link>
          <div className="text-xs text-ink/55 mt-1 truncate">{businessName}</div>
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event("dt-open-palette"))}
            className="mt-3 w-full flex items-center gap-2 rounded-lg border border-border bg-paper/70 px-2.5 py-1.5 text-xs text-ink/55 hover:text-ink hover:border-ink/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
          >
            <Search className="w-3.5 h-3.5" strokeWidth={2} aria-hidden />
            <span className="flex-1 text-left">Find anything</span>
            <kbd className="text-[10px] font-semibold text-ink/40">⌘K</kbd>
          </button>
        </div>
        <NavLinks pathname={pathname} role={role} />
        <AccountFooter businessName={businessName} handle={handle} workspaces={workspaces} />
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden sticky top-0 z-30 flex items-center justify-between h-14 px-4 border-b border-border bg-white">
        <button
          ref={menuButtonRef}
          aria-label="Open navigation"
          onClick={() => setMobileOpen(true)}
          className="w-9 h-9 -ml-2 flex items-center justify-center rounded-md text-ink/60 hover:bg-black/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
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
          <div className="absolute inset-0 bg-black/30" onClick={() => setMobileOpen(false)} aria-hidden />
          <div
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            className="absolute inset-y-0 left-0 w-64 bg-white flex flex-col shadow-popover"
          >
            <div className="flex items-center justify-between px-5 py-5 border-b border-border">
              <span className="inline-flex items-center gap-2 text-ink"><LogoMark className="w-5 h-5" /><span className="font-sans font-extrabold text-[17px] tracking-tight">Daythread</span></span>
              <button
                aria-label="Close navigation"
                onClick={() => setMobileOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-md text-ink/70 hover:bg-black/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
              >
                <X className="w-[18px] h-[18px]" strokeWidth={2} />
              </button>
            </div>
            <NavLinks pathname={pathname} role={role} onNavigate={() => setMobileOpen(false)} />
            <AccountFooter businessName={businessName} handle={handle} workspaces={workspaces} />
          </div>
        </div>
      )}

      <main className="flex-1 min-w-0 pb-16 md:pb-0">{children}</main>

      {/* Phone: the four places that matter, always under the thumb. */}
      <nav aria-label="Primary" className="md:hidden fixed bottom-0 inset-x-0 z-30 border-t border-border bg-white/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
        <ul className="grid grid-cols-5">
          {[
            { href: "/dashboard", label: "Home", icon: Home },
            { href: "/dashboard/inbox", label: "Inbox", icon: InboxIcon },
            { href: "/dashboard/clients", label: "Clients", icon: Users },
            { href: "/dashboard/bookings", label: "Bookings", icon: ClipboardCheck },
          ].map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <li key={item.href}>
                <Link href={item.href} aria-current={active ? "page" : undefined} className={cn("flex flex-col items-center gap-1 py-2.5 text-[10px] font-semibold transition-colors", active ? "text-ink" : "text-ink/45")}>
                  <span className={cn("w-9 h-6 rounded-full flex items-center justify-center transition-colors", active && "bg-ink text-white")}><item.icon className="w-4 h-4" strokeWidth={2} aria-hidden /></span>
                  {item.label}
                </Link>
              </li>
            );
          })}
          <li>
            <button type="button" onClick={() => window.dispatchEvent(new Event("dt-open-palette"))} className="w-full flex flex-col items-center gap-1 py-2.5 text-[10px] font-semibold text-ink/45">
              <span className="w-9 h-6 rounded-full flex items-center justify-center"><Search className="w-4 h-4" strokeWidth={2} aria-hidden /></span>
              Find
            </button>
          </li>
        </ul>
      </nav>
      <CommandPalette />
    </div>
  );
}
