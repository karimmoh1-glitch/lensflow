"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Inbox as InboxIcon, Settings as SettingsIcon, LogOut, Search, ChevronRight, ArrowUpRight, Plug, type LucideIcon } from "lucide-react";
import { BottomSheet } from "@/components/BottomSheet";
import { logout } from "@/app/actions/auth";
import { initials, cn } from "@/lib/utils";
import type { Role } from "@prisma/client";
import { WorkspaceSwitcher, type WorkspaceOption } from "@/app/dashboard/WorkspaceSwitcher";
import { DaythreadLogo, DaythreadMark } from "@/components/brand/DaythreadLogo";
import { CommandPalette } from "./CommandPalette";

/**
 * The shell around the product: Inbox, Settings, your account. Two destinations, nothing
 * to learn. Desktop: a narrow sidebar with a sliding active pill. Phone: the inbox fills
 * the screen; Settings and the account live in a sheet under the avatar.
 */
const NAV: { href: string; label: string; icon: LucideIcon; roles?: Role[] }[] = [
  { href: "/dashboard/inbox", label: "Inbox", icon: InboxIcon },
  { href: "/dashboard/settings", label: "Settings", icon: SettingsIcon, roles: ["OWNER", "ADMIN"] },
];

function isActive(pathname: string, href: string) {
  return pathname.startsWith(href);
}

function NavLinks({ pathname, role, onNavigate }: { pathname: string; role: Role; onNavigate?: () => void }) {
  const items = NAV.filter((item) => !item.roles || item.roles.includes(role));
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
  }, [pathname]);
  return (
    <nav ref={navRef} aria-label="Primary" className="dt-nav flex-1 px-3 py-3 overflow-y-auto scrollbar-thin flex flex-col">
      <div aria-hidden className="dt-nav-indicator" style={{ transform: `translateY(${indicator.y}px)`, opacity: indicator.visible ? 1 : 0 }} />
      <div className="space-y-0.5">
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "dt-nav-link flex items-center gap-2.5 rounded-[10px] px-3 h-[36px] text-[13.5px] transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
                active ? "text-white font-semibold" : "text-ink/65 font-medium hover:text-ink hover:bg-black/[0.04]"
              )}
            >
              <item.icon className="w-4 h-4 shrink-0" strokeWidth={2} aria-hidden />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export type PlanLabel = "Free" | "Pro";

function PlanPill({ plan, role, compact }: { plan: PlanLabel; role: Role; compact?: boolean }) {
  const canBill = role === "OWNER" || role === "ADMIN";
  return (
    <div className={cn("rounded-xl border px-3 py-2.5 flex items-center gap-2", plan === "Pro" ? "border-signal/25 bg-signal-soft/50" : "border-border bg-paper/70")}>
      <span className={cn("text-[10px] font-extrabold uppercase tracking-[0.14em] rounded-full px-2 py-0.5", plan === "Pro" ? "bg-ink text-white" : "bg-black/[0.06] text-ink/60")}>{plan}</span>
      <span className="text-[11px] text-ink/55 flex-1 min-w-0 truncate">{plan === "Free" ? "One inbox, on your own" : "Every channel, and your team"}</span>
      {plan === "Free" && canBill && !compact && (
        <Link href="/dashboard/settings?tab=subscription" className="text-[11px] font-bold text-signal-text hover:underline inline-flex items-center gap-0.5 shrink-0">Pro <ArrowUpRight className="w-3 h-3" strokeWidth={2.5} aria-hidden /></Link>
      )}
    </div>
  );
}

function AccountFooter({ userName, businessName, workspaces, plan, role }: { userName: string; businessName: string; workspaces: WorkspaceOption[]; plan: PlanLabel; role: Role }) {
  return (
    <div className="px-3 py-4 border-t border-border space-y-3">
      <PlanPill plan={plan} role={role} />
      {workspaces.length > 1 && <WorkspaceSwitcher current={businessName} workspaces={workspaces} />}
      <div className="flex items-center gap-2 px-3">
        <div className="w-8 h-8 rounded-full bg-accent-soft text-accent-text flex items-center justify-center text-xs font-semibold shrink-0">{initials(userName)}</div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium truncate">{userName}</div>
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
  userName,
  businessName,
  role,
  plan = "Free",
  workspaces = [],
  connectedChannels = 0,
  children,
}: {
  userName: string;
  businessName: string;
  role: Role;
  /** The plan the workspace is actually entitled to, from the server. */
  plan?: PlanLabel;
  workspaces?: WorkspaceOption[];
  /** How many channels are connected — zero shows the one nudge the product has. */
  connectedChannels?: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams?.toString() ?? "";
  const [moreOpen, setMoreOpen] = useState(false);
  const visibleNav = NAV.filter((item) => !item.roles || item.roles.includes(role));
  const current = visibleNav.find((item) => isActive(pathname, item.href));
  const canConnect = role === "OWNER" || role === "ADMIN";
  const inThread = pathname.startsWith("/dashboard/inbox") && /(^|&)c=/.test(search);
  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  return (
    <div className="min-h-screen bg-paper md:flex">
      <a href="#dt-main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:rounded-full focus:bg-ink focus:text-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold">Skip to content</a>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-56 shrink-0 border-r border-border bg-white flex-col">
        <div className="px-5 py-5 border-b border-border">
          <Link href="/dashboard/inbox" className="inline-flex items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 rounded-md">
            <DaythreadLogo />
          </Link>
          <div className="text-xs text-ink/55 mt-1 truncate">{businessName}</div>
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event("dt-open-palette"))}
            className="mt-3 w-full flex items-center gap-2 rounded-lg border border-border bg-paper/70 px-2.5 py-1.5 text-xs text-ink/55 hover:text-ink hover:border-ink/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
          >
            <Search className="w-3.5 h-3.5" strokeWidth={2} aria-hidden />
            <span className="flex-1 text-left">Find anyone</span>
            <kbd className="text-[10px] font-semibold text-ink/40">⌘K</kbd>
          </button>
        </div>
        <NavLinks pathname={pathname} role={role} />
        <AccountFooter userName={userName} businessName={businessName} workspaces={workspaces} plan={plan} role={role} />
      </aside>

      {/* Phone top bar: hidden inside a thread (the thread has its own header). */}
      {!inThread && (
        <div className="md:hidden sticky top-0 z-30 flex items-center justify-between h-14 px-3 border-b border-border bg-white/95 backdrop-blur pt-[env(safe-area-inset-top)]">
          <Link href="/dashboard/inbox" className="inline-flex items-center gap-2 text-[15px] font-semibold text-ink pl-1"><DaythreadMark className="w-[18px] h-[18px] text-ink" />{current?.label ?? "Daythread"}</Link>
          <div className="flex items-center">
            <button type="button" aria-label="Find anyone" onClick={() => window.dispatchEvent(new Event("dt-open-palette"))} className="w-11 h-11 flex items-center justify-center rounded-lg text-ink/60 hover:bg-black/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50">
              <Search className="w-5 h-5" strokeWidth={2} />
            </button>
            <button type="button" aria-label="Account and settings" aria-haspopup="dialog" aria-expanded={moreOpen} onClick={() => setMoreOpen(true)} className="w-11 h-11 flex items-center justify-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50">
              <span className="w-8 h-8 rounded-full bg-accent-soft text-accent-text flex items-center justify-center text-[11px] font-semibold">{initials(userName)}</span>
            </button>
          </div>
        </div>
      )}

      <main id="dt-main" tabIndex={-1} className="flex-1 min-w-0 focus:outline-none">
        {connectedChannels === 0 && canConnect && !pathname.startsWith("/dashboard/settings") && !inThread && (
          <Link href="/dashboard/settings?tab=channels" className="mx-4 md:mx-8 mt-3 md:mt-4 rounded-2xl border border-signal/25 bg-signal-soft/40 px-3.5 md:px-4 py-2.5 md:py-3 flex items-center gap-3 text-sm text-ink/80 hover:bg-signal-soft/60 transition-colors">
            <Plug className="w-4 h-4 text-signal-text shrink-0" strokeWidth={2} aria-hidden />
            <span className="min-w-0 flex-1"><span className="font-semibold text-ink">Connect your first channel</span><span className="hidden md:inline"> — Gmail, Instagram, WhatsApp or a text number — and messages start arriving here.</span></span>
            <span className="text-signal-text font-semibold shrink-0">Connect →</span>
          </Link>
        )}
        {children}
      </main>

      {/* Phone: account and settings, one tap away, as a native-feeling sheet. */}
      <BottomSheet open={moreOpen} onClose={() => setMoreOpen(false)} title={userName} subtitle={businessName} icon={<DaythreadMark className="w-4 h-4 text-ink" />}>
        <div className="mb-4"><PlanPill plan={plan} role={role} /></div>
        <div className="rounded-2xl border border-border divide-y divide-border overflow-hidden">
          <Link href="/dashboard/inbox" onClick={() => setMoreOpen(false)} className="flex items-center gap-3 px-4 py-3 text-sm text-ink hover:bg-black/[0.03]">
            <InboxIcon className="w-4 h-4 text-ink/50" strokeWidth={2} aria-hidden /><span className="flex-1">Inbox</span><ChevronRight className="w-4 h-4 text-ink/30" aria-hidden />
          </Link>
          {canConnect && (
            <Link href="/dashboard/settings" onClick={() => setMoreOpen(false)} className="flex items-center gap-3 px-4 py-3 text-sm text-ink hover:bg-black/[0.03]">
              <SettingsIcon className="w-4 h-4 text-ink/50" strokeWidth={2} aria-hidden /><span className="flex-1">Settings</span><ChevronRight className="w-4 h-4 text-ink/30" aria-hidden />
            </Link>
          )}
          <button type="button" onClick={() => { setMoreOpen(false); window.dispatchEvent(new Event("dt-open-palette")); }} className="w-full flex items-center gap-3 px-4 py-3 text-sm text-ink hover:bg-black/[0.03]">
            <Search className="w-4 h-4 text-ink/50" strokeWidth={2} aria-hidden /><span className="flex-1 text-left">Find anyone</span><ChevronRight className="w-4 h-4 text-ink/30" aria-hidden />
          </button>
          {workspaces.length > 1 && <div className="px-4 py-3"><WorkspaceSwitcher current={businessName} workspaces={workspaces} /></div>}
          <form action={logout}>
            <button className="w-full flex items-center gap-3 px-4 py-3 text-sm text-ink/70 hover:bg-black/[0.03]">
              <LogOut className="w-4 h-4 text-ink/50" strokeWidth={2} aria-hidden /><span className="flex-1 text-left">Log out</span>
            </button>
          </form>
        </div>
      </BottomSheet>
      <CommandPalette />
    </div>
  );
}
