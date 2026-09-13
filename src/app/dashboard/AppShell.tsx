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
  type LucideIcon,
} from "lucide-react";
import { BottomSheet } from "@/components/BottomSheet";
import { logout } from "@/app/actions/auth";
import { initials } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { Role } from "@prisma/client";
import { WorkspaceSwitcher, type WorkspaceOption } from "@/app/dashboard/WorkspaceSwitcher";
import { LogoMark } from "@/components/Logo";
import { DaythreadLogo, DaythreadMark } from "@/components/brand/DaythreadLogo";
import { CommandPalette } from "./CommandPalette";
import { Search } from "lucide-react";

// One ink for every navigation icon. Color in the sidebar is noise: the only thing that
// should draw the eye there is where you are, and the active pill already says it.
type NavItem = { href: string; label: string; icon: LucideIcon; tone: string; roles?: Role[]; group: "work" | "automate" | "workspace"; lower?: boolean; requires?: "payments" };
const BASE_NAV: NavItem[] = [
  { href: "/dashboard", label: "Today", icon: Home, tone: "text-ink/55", group: "work" },
  { href: "/dashboard/inbox", label: "Inbox", icon: InboxIcon, tone: "text-ink/55", group: "work" },
  { href: "/dashboard/calendar", label: "Calendar", icon: CalendarDays, tone: "text-ink/55", group: "work" },
  { href: "/dashboard/bookings", label: "Bookings", icon: ClipboardCheck, tone: "text-ink/55", group: "work" },
  { href: "/dashboard/clients", label: "People", icon: Users, tone: "text-ink/55", group: "work" },
  // Only for a workspace whose Stripe account is connected: an empty ledger is not a destination.
  { href: "/dashboard/payments", label: "Payments", icon: CreditCard, tone: "text-ink/55", group: "work", requires: "payments" },
  { href: "/dashboard/agent", label: "Assistant", icon: ListChecks, tone: "text-ink/55", group: "automate" },
  { href: "/dashboard/automations", label: "Automations", icon: Zap, tone: "text-ink/55", group: "automate" },
  { href: "/dashboard/settings", label: "Settings", icon: SettingsIcon, tone: "text-ink/55", group: "workspace", roles: ["OWNER", "ADMIN"], lower: true },
];
const GROUP_LABEL: Record<"work" | "automate" | "workspace", string> = { work: "", automate: "Runs for you", workspace: "" };
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

function NavLinks({ pathname, search, role, showPayments, onNavigate }: { pathname: string; search: string; role: Role; showPayments: boolean; onNavigate?: () => void }) {
  const items = navFor(role, showPayments);
  const groups = (["work", "automate", "workspace"] as const).map((g) => ({ g, items: items.filter((i) => i.group === g && !i.lower) })).filter((x) => x.items.length > 0);
  const lower = items.filter((i) => i.lower);
  // The active pill is one element that slides between links (transform only), so moving
  // through the product reads as one selection travelling, not a series of highlights.
  const navRef = useRef<HTMLElement>(null);
  const [indicator, setIndicator] = useState<{ y: number; visible: boolean }>({ y: 0, visible: false });
  useEffect(() => {
    const nav = navRef.current;
    const active = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!nav || !active) return setIndicator((i) => ({ ...i, visible: false }));
    const y = active.getBoundingClientRect().top - nav.getBoundingClientRect().top + nav.scrollTop;
    setIndicator({ y, visible: true });
  }, [pathname, search]);
  const link = (item: (typeof items)[number]) => {
    const active = isActive(pathname, item.href, search);
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={cn(
          "dt-nav-link flex items-center gap-2.5 rounded-lg px-2.5 h-8 text-13 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/70",
          active ? "text-ink font-semibold" : "text-ink/70 font-medium hover:text-ink hover:bg-black/[0.035]"
        )}
      >
        <item.icon className={cn("w-4 h-4 shrink-0", active ? "text-ink" : item.tone)} strokeWidth={1.9} aria-hidden />
        {item.label}
      </Link>
    );
  };
  return (
    <nav ref={navRef} aria-label="Primary" className="dt-nav flex-1 px-3 py-3 overflow-y-auto scrollbar-thin flex flex-col">
      <div aria-hidden className="dt-nav-indicator" style={{ transform: `translateY(${indicator.y}px)`, opacity: indicator.visible ? 1 : 0 }} />
      {groups.map(({ g, items }, gi) => (
        <div key={g} className={cn(gi > 0 && "mt-5")}>
          {GROUP_LABEL[g] && <div className="px-2.5 pb-1 text-xs font-medium text-ink/55">{GROUP_LABEL[g]}</div>}
          <div className="space-y-0.5">{items.map(link)}</div>
        </div>
      ))}
      {lower.length > 0 && <div className="mt-auto pt-5 space-y-0.5">{lower.map(link)}</div>}
    </nav>
  );
}

function PlanPill({ plan, role, compact }: { plan: PlanLabel; role: Role; compact?: boolean }) {
  const canBill = role === "OWNER" || role === "ADMIN";
  const next = plan === "Free" ? "Pro" : plan === "Pro" ? "Business" : null;
  return (
    <div className="flex items-center gap-2 px-2.5 h-8 text-xs">
      <span className="font-semibold text-ink">{plan} plan</span>
      {next && canBill && !compact && (
        <Link href="/dashboard/settings?tab=subscription" className="ml-auto font-medium text-ink/60 hover:text-ink inline-flex items-center gap-0.5 shrink-0">Upgrade <ArrowUpRight className="w-3 h-3" strokeWidth={2} aria-hidden /></Link>
      )}
    </div>
  );
}

function AccountFooter({
  businessName,
  handle,
  workspaces,
  plan,
  role,
}: {
  businessName: string;
  handle: string;
  workspaces: WorkspaceOption[];
  plan: PlanLabel;
  role: Role;
}) {
  return (
    <div className="px-3 py-3 border-t border-border space-y-1">
      <PlanPill plan={plan} role={role} />
      <Link
        href={`/book/${handle}`}
        target="_blank"
        className="flex items-center gap-1.5 h-8 text-xs text-ink/60 font-medium px-2.5 rounded-lg hover:text-ink hover:bg-black/[0.035]"
      >
        View booking page
        <ExternalLink className="w-3 h-3" strokeWidth={2} aria-hidden />
      </Link>
      {workspaces.length > 1 && <WorkspaceSwitcher current={businessName} workspaces={workspaces} />}
      <div className="flex items-center gap-2 px-2.5 pt-2">
        <div className="w-7 h-7 rounded-full bg-ink/[0.06] text-ink/70 flex items-center justify-center text-2xs font-semibold shrink-0">
          {initials(businessName)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium truncate">{businessName}</div>
          <form action={logout}>
            <button className="flex items-center gap-1 text-xs text-ink/65 hover:text-ink/70">
              <LogOut className="w-3 h-3" strokeWidth={2} aria-hidden />
              Log out
            </button>
          </form>
        </div>
      </div>
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
    // region. On a phone that is one column — header, content, tab bar — so the header and
    // the tab bar stay put without position: fixed and the content scrolls between them;
    // from md the sidebar becomes the first column and keeps its own full height, so a long
    // settings page or inbox thread can never push Settings or Log out off the screen.
    <div className="h-[100dvh] overflow-hidden bg-paper flex flex-col md:flex-row">
      <a href="#dt-main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:rounded-lg focus:bg-ink focus:text-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold">Skip to content</a>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-56 shrink-0 border-r border-border bg-[#FCFCFB] flex-col">
        <div className="px-5 pt-5 pb-3">
          <Link href="/dashboard" className="inline-flex items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 rounded-md">
            <DaythreadLogo />
          </Link>
          <div className="text-xs text-ink/70 mt-1 truncate">{businessName}</div>
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event("dt-open-palette"))}
            className="mt-3.5 w-full flex items-center gap-2 rounded-lg border border-ink/[0.1] bg-white px-2.5 h-8 text-xs text-ink/60 hover:text-ink hover:border-ink/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/70"
          >
            <Search className="w-3.5 h-3.5" strokeWidth={2} aria-hidden />
            <span className="flex-1 text-left">Find anything</span>
            <kbd className="text-2xs font-semibold text-ink/65">⌘K</kbd>
          </button>
        </div>
        <NavLinks pathname={pathname} search={search} role={role} showPayments={showPayments} />
        <AccountFooter businessName={businessName} handle={handle} workspaces={workspaces} plan={plan} role={role} />
      </aside>

      {/* Mobile top bar: where you are, search, and the More sheet under the avatar. */}
      <header className="md:hidden shrink-0 flex items-center justify-between h-14 px-3 border-b border-border bg-white/95 backdrop-blur pt-[env(safe-area-inset-top)]">
        <button
          ref={menuButtonRef}
          aria-label="Open navigation"
          onClick={() => setMobileOpen(true)}
          className="w-11 h-11 flex items-center justify-center rounded-lg text-ink/65 hover:bg-black/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
        >
          <Menu className="w-5 h-5" strokeWidth={2} />
        </button>
        <span className="inline-flex items-center gap-2 text-[15px] font-semibold text-ink"><DaythreadMark className="w-[18px] h-[18px] text-ink" />{current?.label ?? "Daythread"}</span>
        <div className="flex items-center">
          <button type="button" aria-label="Find anything" onClick={() => window.dispatchEvent(new Event("dt-open-palette"))} className="w-11 h-11 flex items-center justify-center rounded-lg text-ink/65 hover:bg-black/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50">
            <Search className="w-5 h-5" strokeWidth={2} />
          </button>
          <button type="button" aria-label="Account and more" onClick={() => setMoreOpen(true)} className="w-11 h-11 flex items-center justify-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50">
            <span className="w-8 h-8 rounded-full bg-ink/[0.06] text-ink/70 flex items-center justify-center text-2xs font-semibold">{initials(businessName)}</span>
          </button>
        </div>
      </header>

      {/* Mobile nav drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/30" onClick={() => setMobileOpen(false)} aria-hidden />
          <div
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            className="absolute inset-y-0 left-0 w-64 bg-white flex flex-col shadow-overlay"
          >
            <div className="flex items-center justify-between px-5 py-5 border-b border-border">
              <DaythreadLogo />
              <button
                aria-label="Close navigation"
                onClick={() => setMobileOpen(false)}
                className="w-11 h-11 flex items-center justify-center rounded-md text-ink/70 hover:bg-black/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
              >
                <X className="w-[18px] h-[18px]" strokeWidth={2} />
              </button>
            </div>
            <NavLinks pathname={pathname} search={search} role={role} showPayments={showPayments} onNavigate={() => setMobileOpen(false)} />
            <AccountFooter businessName={businessName} handle={handle} workspaces={workspaces} plan={plan} role={role} />
          </div>
        </div>
      )}

      <main id="dt-main" tabIndex={-1} className="flex-1 min-w-0 min-h-0 overflow-y-auto overscroll-contain focus:outline-none">
        {wantedIntegrations.length > 0 && !pathname.startsWith("/dashboard/settings") && (
          <Link href="/dashboard/settings?tab=channels" className="mx-4 md:mx-8 mt-3 md:mt-4 rounded-xl border border-border bg-white shadow-surface px-3.5 md:px-4 py-2.5 flex items-center gap-3 text-13 text-ink/75 hover:border-ink/20 transition-colors">
            <span className="min-w-0 flex-1 truncate md:whitespace-normal"><span className="font-semibold text-ink">Connect {wantedIntegrations.join(", ")}</span><span className="hidden md:inline"> and your first real conversations arrive here.</span></span>
            <span className="text-ink font-semibold shrink-0">Connect →</span>
          </Link>
        )}
        {children}
      </main>

      {/* Phone: the four places that matter, always under the thumb — and More for the rest. */}
      <nav aria-label="Primary" className="md:hidden shrink-0 border-t border-border bg-white/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
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
                <Link href={item.href} aria-current={active ? "page" : undefined} className={cn("flex flex-col items-center gap-1 pt-2 pb-1.5 min-h-[3.75rem] text-2xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/50", active ? "text-ink" : "text-ink/65 active:text-ink")}>
                  <span className={cn("w-10 h-7 rounded-lg flex items-center justify-center transition-colors", active && "bg-ink/[0.07]")}><item.icon className="w-[19px] h-[19px]" strokeWidth={active ? 2.2 : 1.9} aria-hidden /></span>
                  {item.label}
                </Link>
              </li>
            );
          })}
          <li>
            <button type="button" onClick={() => setMoreOpen(true)} aria-haspopup="dialog" aria-expanded={moreOpen} className={cn("w-full flex flex-col items-center gap-1 pt-2 pb-1.5 min-h-[3.75rem] text-2xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/50", moreOpen || (current && !TAB_HREFS.includes(current.href)) ? "text-ink" : "text-ink/65")}>
              <span className={cn("w-10 h-7 rounded-lg flex items-center justify-center transition-colors", moreOpen || (current && !TAB_HREFS.includes(current.href)) ? "bg-ink/[0.07]" : "")}><LayoutGrid className="w-[18px] h-[18px]" strokeWidth={2} aria-hidden /></span>
              More
            </button>
          </li>
        </ul>
      </nav>

      {/* More: everything else, one tap away, as a native-feeling sheet. */}
      <BottomSheet open={moreOpen} onClose={() => setMoreOpen(false)} title={businessName} subtitle="Everything else in Daythread" icon={<DaythreadMark className="w-4 h-4 text-ink" />}>
        <div className="mb-4"><PlanPill plan={plan} role={role} /></div>
        <ul className="grid grid-cols-3 gap-2">
          {visibleNav
            .filter((item) => !TAB_HREFS.includes(item.href))
            .map((item) => {
              const active = isActive(pathname, item.href, search);
              return (
                <li key={item.href}>
                  <Link href={item.href} onClick={() => setMoreOpen(false)} aria-current={active ? "page" : undefined} className={cn("flex flex-col items-center justify-center gap-1.5 rounded-xl border px-2 py-3.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50", active ? "border-ink/20 bg-ink/[0.05] text-ink" : "border-border bg-white text-ink/80 hover:bg-black/[0.03] active:bg-black/[0.05]")}>
                    <item.icon className="w-5 h-5 text-ink/70" strokeWidth={1.9} aria-hidden />
                    <span className="text-center leading-tight">{item.label}</span>
                  </Link>
                </li>
              );
            })}
        </ul>
        <div className="mt-4 rounded-xl border border-border divide-y divide-border overflow-hidden">
          <button type="button" onClick={() => { setMoreOpen(false); window.dispatchEvent(new Event("dt-open-palette")); }} className="w-full flex items-center gap-3 px-4 py-3 text-sm text-ink hover:bg-black/[0.03]">
            <Search className="w-4 h-4 text-ink/65" strokeWidth={2} aria-hidden /><span className="flex-1 text-left">Find anything</span><ChevronRight className="w-4 h-4 text-ink/30" aria-hidden />
          </button>
          <Link href={`/book/${handle}`} target="_blank" onClick={() => setMoreOpen(false)} className="flex items-center gap-3 px-4 py-3 text-sm text-ink hover:bg-black/[0.03]">
            <ExternalLink className="w-4 h-4 text-ink/65" strokeWidth={2} aria-hidden /><span className="flex-1">View my booking page</span><ChevronRight className="w-4 h-4 text-ink/30" aria-hidden />
          </Link>
          {workspaces.length > 1 && <div className="px-4 py-3"><WorkspaceSwitcher current={businessName} workspaces={workspaces} /></div>}
          <form action={logout}>
            <button className="w-full flex items-center gap-3 px-4 py-3 text-sm text-ink/70 hover:bg-black/[0.03]">
              <LogOut className="w-4 h-4 text-ink/65" strokeWidth={2} aria-hidden /><span className="flex-1 text-left">Log out</span>
            </button>
          </form>
        </div>
      </BottomSheet>
      <CommandPalette />
    </div>
  );
}
