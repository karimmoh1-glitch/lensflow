"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Home,
  Inbox as InboxIcon,
  CalendarDays,
  ClipboardCheck,
  Users,
  Zap,
  ListChecks,
  Settings as SettingsIcon,
  ExternalLink,
  LogOut,
  Menu,
  X,
  LayoutGrid,
  ChevronRight,
  ArrowUpRight,
  CreditCard,
  Plug,
  Search,
  type LucideIcon,
} from "lucide-react";
import { BottomSheet } from "@/components/BottomSheet";
import { logout } from "@/app/actions/auth";
import { initials } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { Role } from "@prisma/client";
import { WorkspaceSwitcher, type WorkspaceOption } from "@/app/dashboard/WorkspaceSwitcher";
import { DaythreadMark } from "@/components/brand/DaythreadLogo";
import { CommandPalette } from "./CommandPalette";

// One ink for every navigation icon. Color in the sidebar is noise: the only thing that
// should draw the eye there is where you are.
type NavItem = { href: string; label: string; icon: LucideIcon; tone: string; roles?: Role[]; group: "work" | "automate" | "workspace"; lower?: boolean; requires?: "payments" };
const BASE_NAV: NavItem[] = [
  { href: "/dashboard", label: "Today", icon: Home, tone: "text-ink/60", group: "work" },
  { href: "/dashboard/inbox", label: "Inbox", icon: InboxIcon, tone: "text-ink/60", group: "work" },
  { href: "/dashboard/calendar", label: "Calendar", icon: CalendarDays, tone: "text-ink/60", group: "work" },
  { href: "/dashboard/bookings", label: "Bookings", icon: ClipboardCheck, tone: "text-ink/60", group: "work" },
  { href: "/dashboard/clients", label: "People", icon: Users, tone: "text-ink/60", group: "work" },
  // Only for a workspace whose Stripe account is connected: an empty ledger is not a destination.
  { href: "/dashboard/payments", label: "Payments", icon: CreditCard, tone: "text-ink/60", group: "work", requires: "payments" },
  { href: "/dashboard/agent", label: "Assistant", icon: ListChecks, tone: "text-ink/60", group: "automate" },
  { href: "/dashboard/automations", label: "Automations", icon: Zap, tone: "text-ink/60", group: "automate" },
  { href: "/dashboard/settings", label: "Settings", icon: SettingsIcon, tone: "text-ink/60", group: "workspace", roles: ["OWNER", "ADMIN"], lower: true },
];
const GROUP_LABEL: Record<"work" | "automate" | "workspace", string> = { work: "", automate: "Automation", workspace: "" };
const navFor = (role: Role, showPayments: boolean) => BASE_NAV.filter((item) => (!item.roles || item.roles.includes(role)) && (item.requires !== "payments" || showPayments));
const TAB_HREFS = ["/dashboard", "/dashboard/inbox", "/dashboard/calendar", "/dashboard/bookings"];

function isActive(pathname: string, href: string, search = "") {
  if (href === "/dashboard") return pathname === "/dashboard";
  if (href.includes("?")) {
    const [path, qs] = href.split("?");
    return pathname.startsWith(path) && search.includes(qs);
  }
  return pathname.startsWith(href);
}

/** Where you are is a quiet fill behind the item and full-ink text; nothing slides, glows or floats. */
function NavLinks({ pathname, search, role, showPayments, onNavigate }: { pathname: string; search: string; role: Role; showPayments: boolean; onNavigate?: () => void }) {
  const items = navFor(role, showPayments);
  const groups = (["work", "automate", "workspace"] as const).map((g) => ({ g, items: items.filter((i) => i.group === g && !i.lower) })).filter((x) => x.items.length > 0);
  const lower = items.filter((i) => i.lower);
  const link = (item: (typeof items)[number]) => {
    const active = isActive(pathname, item.href, search);
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex items-center gap-2.5 rounded px-2 h-8 text-13 font-medium transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/70",
          active ? "bg-ink/[0.07] text-ink" : "text-ink/70 hover:text-ink hover:bg-ink/[0.04]"
        )}
      >
        <item.icon className={cn("w-4 h-4 shrink-0", active ? "text-ink" : "text-ink/55")} strokeWidth={1.75} aria-hidden />
        {item.label}
      </Link>
    );
  };
  return (
    <nav aria-label="Primary" className="flex-1 px-2.5 py-2 overflow-y-auto scrollbar-thin flex flex-col">
      {groups.map(({ g, items }, gi) => (
        <div key={g} className={cn(gi > 0 && "mt-5")}>
          {GROUP_LABEL[g] && <div className="px-2 pb-1 text-xs text-ink/65">{GROUP_LABEL[g]}</div>}
          <div className="space-y-px">{items.map(link)}</div>
        </div>
      ))}
      {lower.length > 0 && <div className="mt-auto pt-5 space-y-px">{lower.map(link)}</div>}
    </nav>
  );
}

function PlanLine({ plan, role }: { plan: PlanLabel; role: Role }) {
  const canBill = role === "OWNER" || role === "ADMIN";
  const next = plan === "Free" ? "Pro" : plan === "Pro" ? "Business" : null;
  return (
    <span className="flex items-center gap-1.5 text-xs text-ink/65">
      {plan} plan
      {next && canBill && (
        <>
          <span aria-hidden>·</span>
          <Link href="/dashboard/settings?tab=subscription" className="font-medium text-ink/80 hover:text-ink underline-offset-2 hover:underline">Upgrade</Link>
        </>
      )}
    </span>
  );
}

function AccountFooter({ businessName, handle, plan, role }: { businessName: string; handle: string; plan: PlanLabel; role: Role }) {
  return (
    <div className="px-2.5 pt-2 pb-3 border-t border-border">
      <Link
        href={`/book/${handle}`}
        target="_blank"
        className="flex items-center gap-2.5 h-8 px-2 rounded text-13 font-medium text-ink/70 hover:text-ink hover:bg-ink/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/70"
      >
        <ExternalLink className="w-4 h-4 text-ink/55" strokeWidth={1.75} aria-hidden />
        Booking page
      </Link>
      <div className="mt-2 flex items-center gap-2.5 px-2">
        <span aria-hidden className="w-7 h-7 rounded-full bg-ink/[0.07] text-ink/75 flex items-center justify-center text-2xs font-semibold shrink-0">{initials(businessName)}</span>
        <div className="min-w-0 flex-1">
          <div className="text-13 font-medium text-ink truncate">{businessName}</div>
          <PlanLine plan={plan} role={role} />
        </div>
        <form action={logout}>
          <button aria-label="Log out" title="Log out" className="w-8 h-8 rounded flex items-center justify-center text-ink/55 hover:text-ink hover:bg-ink/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/70">
            <LogOut className="w-4 h-4" strokeWidth={1.75} aria-hidden />
          </button>
        </form>
      </div>
    </div>
  );
}

/** The top of the sidebar: whose workspace this is (a switcher when there is more than one) and search. */
function SidebarHead({ businessName, workspaces }: { businessName: string; workspaces: WorkspaceOption[] }) {
  return (
    <div className="px-2.5 pt-3 pb-2">
      {workspaces.length > 1 ? (
        <WorkspaceSwitcher current={businessName} workspaces={workspaces} placement="below" />
      ) : (
        <Link href="/dashboard" className="flex items-center gap-2.5 h-9 px-2 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/70">
          <DaythreadMark className="w-[18px] h-[18px] text-ink shrink-0" title="Daythread" />
          <span className="text-13 font-semibold text-ink truncate">{businessName}</span>
        </Link>
      )}
      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event("dt-open-palette"))}
        className="mt-1 w-full flex items-center gap-2.5 h-8 px-2 rounded text-13 font-medium text-ink/70 hover:text-ink hover:bg-ink/[0.04] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/70"
      >
        <Search className="w-4 h-4 text-ink/55" strokeWidth={1.75} aria-hidden />
        <span className="flex-1 text-left">Search</span>
        <kbd className="font-sans text-xs text-ink/65 rounded-sm border border-border bg-white px-1 leading-4">⌘K</kbd>
      </button>
    </div>
  );
}

export type PlanLabel = "Free" | "Pro" | "Business";

export function AppShell({
  businessName,
  handle,
  role,
  plan = "Free",
  workspaces = [],
  wantedIntegrations = [],
  showPayments = false,
  children,
}: {
  businessName: string;
  handle: string;
  role: Role;
  /** The plan the workspace is actually entitled to, from the server. */
  plan?: PlanLabel;
  workspaces?: WorkspaceOption[];
  /** Names of tools chosen during onboarding that aren't connected yet. */
  wantedIntegrations?: string[];
  /** Whether the workspace has a connected Stripe account, the only source of the Payments ledger. */
  showPayments?: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams?.toString() ?? "";
  const [mobileOpen, setMobileOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const visibleNav = navFor(role, showPayments);
  const current = visibleNav.find((item) => isActive(pathname, item.href, search));
  const drawerRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

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
    // The application shell owns the viewport and never grows with its content: the height
    // is fixed to the dynamic viewport (so an iOS toolbar appearing does not create a
    // second scrollbar) and overflow is hidden here, which makes <main> the single scroll
    // region. On a phone that is one column — header, content, tab bar; from md the sidebar
    // is the first column with its own full height, so Settings and Log out never scroll away.
    <div className="h-[100dvh] overflow-hidden bg-white flex flex-col md:flex-row">
      <a href="#dt-main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:rounded focus:bg-ink focus:text-white focus:px-4 focus:py-2 focus:text-sm focus:font-medium">Skip to content</a>
      <aside className="hidden md:flex w-[232px] shrink-0 border-r border-border bg-paper flex-col">
        <SidebarHead businessName={businessName} workspaces={workspaces} />
        <NavLinks pathname={pathname} search={search} role={role} showPayments={showPayments} />
        <AccountFooter businessName={businessName} handle={handle} plan={plan} role={role} />
      </aside>

      {/* Phone top bar: the navigation drawer, where you are, and search. */}
      <header className="md:hidden shrink-0 grid grid-cols-[44px_1fr_44px] items-center h-12 px-1.5 border-b border-border bg-white pt-[env(safe-area-inset-top)] box-content">
        <button
          ref={menuButtonRef}
          aria-label="Open navigation"
          onClick={() => setMobileOpen(true)}
          className="w-11 h-11 flex items-center justify-center rounded text-ink/70 hover:bg-ink/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/70"
        >
          <Menu className="w-5 h-5" strokeWidth={1.75} />
        </button>
        <span className="text-center text-sm font-semibold text-ink truncate">{current?.label ?? "Daythread"}</span>
        <button type="button" aria-label="Search" onClick={() => window.dispatchEvent(new Event("dt-open-palette"))} className="w-11 h-11 flex items-center justify-center rounded text-ink/70 hover:bg-ink/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/70">
          <Search className="w-5 h-5" strokeWidth={1.75} />
        </button>
      </header>

      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-ink/30" onClick={() => setMobileOpen(false)} aria-hidden />
          <div ref={drawerRef} role="dialog" aria-modal="true" aria-label="Navigation" className="absolute inset-y-0 left-0 w-[272px] max-w-[85vw] bg-paper flex flex-col shadow-overlay pt-[env(safe-area-inset-top)]">
            <div className="flex items-start">
              <div className="flex-1 min-w-0"><SidebarHead businessName={businessName} workspaces={workspaces} /></div>
              <button aria-label="Close navigation" onClick={() => setMobileOpen(false)} className="mt-2.5 mr-1.5 w-11 h-11 shrink-0 flex items-center justify-center rounded text-ink/70 hover:bg-ink/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/70">
                <X className="w-[18px] h-[18px]" strokeWidth={1.75} />
              </button>
            </div>
            <NavLinks pathname={pathname} search={search} role={role} showPayments={showPayments} onNavigate={() => setMobileOpen(false)} />
            <AccountFooter businessName={businessName} handle={handle} plan={plan} role={role} />
          </div>
        </div>
      )}

      <main id="dt-main" tabIndex={-1} className="flex-1 min-w-0 min-h-0 overflow-y-auto overscroll-contain focus:outline-none">
        {/* Today has the setup checklist, which already leads with this. */}
        {wantedIntegrations.length > 0 && !pathname.startsWith("/dashboard/settings") && pathname !== "/dashboard" && (
          <Link href="/dashboard/settings?tab=channels" className="flex items-center gap-3 px-4 md:px-8 min-h-10 py-2 border-b border-border bg-paper text-13 text-ink/70 hover:text-ink transition-colors">
            <Plug className="w-4 h-4 text-ink/55 shrink-0" strokeWidth={1.75} aria-hidden />
            <span className="min-w-0 flex-1 truncate"><span className="font-medium text-ink">Connect {wantedIntegrations.join(", ")}</span><span className="hidden md:inline"> so your real conversations arrive here.</span></span>
            <span className="font-medium text-ink shrink-0">Connect</span>
          </Link>
        )}
        {children}
      </main>

      {/* Phone: the four places that matter, always under the thumb — and More for the rest. */}
      <nav aria-label="Primary" className="md:hidden shrink-0 border-t border-border bg-white pb-[env(safe-area-inset-bottom)]">
        <ul className="grid grid-cols-5">
          {[
            { href: "/dashboard", label: "Today", icon: Home },
            { href: "/dashboard/inbox", label: "Inbox", icon: InboxIcon },
            { href: "/dashboard/calendar", label: "Calendar", icon: CalendarDays },
            { href: "/dashboard/bookings", label: "Bookings", icon: ClipboardCheck },
          ].map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <li key={item.href}>
                <Link href={item.href} aria-current={active ? "page" : undefined} className={cn("flex flex-col items-center justify-center gap-1 h-14 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink/70", active ? "text-ink" : "text-ink/60 active:text-ink")}>
                  <item.icon className="w-5 h-5" strokeWidth={active ? 2 : 1.75} aria-hidden />
                  {item.label}
                </Link>
              </li>
            );
          })}
          <li>
            <button type="button" onClick={() => setMoreOpen(true)} aria-haspopup="dialog" aria-expanded={moreOpen} className={cn("w-full flex flex-col items-center justify-center gap-1 h-14 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink/70", moreOpen || (current && !TAB_HREFS.includes(current.href)) ? "text-ink" : "text-ink/60")}>
              <LayoutGrid className="w-5 h-5" strokeWidth={1.75} aria-hidden />
              More
            </button>
          </li>
        </ul>
      </nav>

      <BottomSheet open={moreOpen} onClose={() => setMoreOpen(false)} title={businessName} subtitle={`${plan} plan`}>
        <ul className="-mx-2">
          {visibleNav
            .filter((item) => !TAB_HREFS.includes(item.href))
            .map((item) => {
              const active = isActive(pathname, item.href, search);
              return (
                <li key={item.href}>
                  <Link href={item.href} onClick={() => setMoreOpen(false)} aria-current={active ? "page" : undefined} className={cn("flex items-center gap-3 h-12 px-2 rounded text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/70", active ? "bg-ink/[0.06] text-ink" : "text-ink hover:bg-ink/[0.04]")}>
                    <item.icon className="w-5 h-5 text-ink/55" strokeWidth={1.75} aria-hidden />
                    <span className="flex-1">{item.label}</span>
                    <ChevronRight className="w-4 h-4 text-ink/30" aria-hidden />
                  </Link>
                </li>
              );
            })}
        </ul>
        <div className="mt-3 pt-3 -mx-2 border-t border-border">
          <Link href={`/book/${handle}`} target="_blank" onClick={() => setMoreOpen(false)} className="flex items-center gap-3 h-12 px-2 rounded text-sm font-medium text-ink hover:bg-ink/[0.04]">
            <ExternalLink className="w-5 h-5 text-ink/55" strokeWidth={1.75} aria-hidden /><span className="flex-1">Booking page</span>
          </Link>
          {(role === "OWNER" || role === "ADMIN") && plan !== "Business" && (
            <Link href="/dashboard/settings?tab=subscription" onClick={() => setMoreOpen(false)} className="flex items-center gap-3 h-12 px-2 rounded text-sm font-medium text-ink hover:bg-ink/[0.04]">
              <ArrowUpRight className="w-5 h-5 text-ink/55" strokeWidth={1.75} aria-hidden /><span className="flex-1">Upgrade plan</span>
            </Link>
          )}
          {workspaces.length > 1 && <div className="py-1"><WorkspaceSwitcher current={businessName} workspaces={workspaces} /></div>}
          <form action={logout}>
            <button className="w-full flex items-center gap-3 h-12 px-2 rounded text-sm font-medium text-ink/70 hover:bg-ink/[0.04]">
              <LogOut className="w-5 h-5 text-ink/55" strokeWidth={1.75} aria-hidden /><span className="flex-1 text-left">Log out</span>
            </button>
          </form>
        </div>
      </BottomSheet>
      <CommandPalette />
    </div>
  );
}
