"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Inbox, Users, CalendarClock, CreditCard, Zap, Sparkles, Receipt, Settings, Home, ArrowRight } from "lucide-react";
import { universalSearch, type SearchHit } from "@/app/actions/search";
import { cn } from "@/lib/utils";

/**
 * ⌘K. One box that finds anyone and anything on the thread, and goes anywhere. Results
 * arrive as you type (debounced, tenant-scoped on the server); a person at the top gets a
 * summary — conversations, bookings, paid, and the next action — so "Sarah" answers
 * "where do we stand with Sarah" before you press Enter. Fully keyboard-driven, a real
 * dialog for assistive tech, and closed with Escape or a click outside.
 */
type Item = { key: string; title: string; subtitle?: string; href: string; icon: typeof Search; group: "Go to" | "People" | "Conversations" | "Bookings" | "Payments" };

const GO: Item[] = [
  { key: "go-home", title: "Home", subtitle: "What needs you now", href: "/dashboard", icon: Home, group: "Go to" },
  { key: "go-inbox", title: "Priority inbox", subtitle: "Conversations that need you", href: "/dashboard/inbox", icon: Inbox, group: "Go to" },
  { key: "go-all", title: "All inbox", subtitle: "Everything, classified", href: "/dashboard/inbox?view=all", icon: Inbox, group: "Go to" },
  { key: "go-clients", title: "Clients", href: "/dashboard/clients", icon: Users, group: "Go to" },
  { key: "go-bookings", title: "Bookings", href: "/dashboard/bookings", icon: CalendarClock, group: "Go to" },
  { key: "go-payments", title: "Payments", href: "/dashboard/payments", icon: CreditCard, group: "Go to" },
  { key: "go-automations", title: "Automations", href: "/dashboard/automations", icon: Zap, group: "Go to" },
  { key: "go-copilot", title: "Copilot", subtitle: "Ask what needs you today", href: "/dashboard/copilot", icon: Sparkles, group: "Go to" },
  { key: "go-billing", title: "Billing", href: "/dashboard/billing", icon: Receipt, group: "Go to" },
  { key: "go-settings", title: "Settings", subtitle: "Connections, team, booking page", href: "/dashboard/settings", icon: Settings, group: "Go to" },
];
const ICON: Record<SearchHit["kind"], typeof Search> = { client: Users, conversation: Inbox, booking: CalendarClock, payment: CreditCard };
const GROUP: Record<SearchHit["kind"], Item["group"]> = { client: "People", conversation: "Conversations", booking: "Bookings", payment: "Payments" };

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [summary, setSummary] = useState<Awaited<ReturnType<typeof universalSearch>>["summary"]>();
  const [cursor, setCursor] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // ⌘K / Ctrl+K opens; Escape closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const onOpen = () => setOpen(true);
    window.addEventListener("dt-open-palette", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("dt-open-palette", onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setQ("");
      setHits([]);
      setSummary(undefined);
      setCursor(0);
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [open]);

  // Debounced server search.
  useEffect(() => {
    if (!open) return;
    const term = q.trim();
    if (term.length < 2) {
      setHits([]);
      setSummary(undefined);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      const r = await universalSearch(term);
      setHits(r.hits);
      setSummary(r.summary);
      setCursor(0);
      setLoading(false);
    }, 140);
    return () => clearTimeout(t);
  }, [q, open]);

  const items = useMemo<Item[]>(() => {
    const term = q.trim().toLowerCase();
    const go = term ? GO.filter((g) => g.title.toLowerCase().includes(term) || g.subtitle?.toLowerCase().includes(term)) : GO;
    const found: Item[] = hits.map((h) => ({ key: `${h.kind}-${h.id}`, title: h.title, subtitle: h.subtitle, href: h.href, icon: ICON[h.kind], group: GROUP[h.kind] }));
    return [...found, ...go];
  }, [q, hits]);

  const go = useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router]
  );

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(items.length - 1, c + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(0, c - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const it = items[cursor];
      if (it) go(it.href);
    }
  }

  if (!open) return null;

  let lastGroup: Item["group"] | null = null;
  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center px-4 pt-[12vh]" role="presentation">
      <div className="absolute inset-0 bg-ink/30 backdrop-blur-[2px]" onClick={() => setOpen(false)} aria-hidden />
      <div role="dialog" aria-modal="true" aria-label="Search and go" className="relative w-full max-w-xl rounded-2xl border border-ink/10 bg-white shadow-[0_40px_100px_-30px_rgba(16,17,20,0.5)] overflow-hidden dt-land">
        <div className="flex items-center gap-3 px-4 border-b border-border">
          <Search className="w-4 h-4 text-ink/40 shrink-0" strokeWidth={2} />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Find a person, a booking, a payment — or go somewhere"
            aria-label="Search"
            aria-activedescendant={items[cursor] ? `cmd-${items[cursor].key}` : undefined}
            aria-controls="cmd-list"
            role="combobox"
            aria-expanded="true"
            className="flex-1 h-14 bg-transparent text-[15px] text-ink placeholder:text-ink/35 outline-none"
          />
          <kbd className="hidden sm:inline-flex items-center rounded-md border border-border bg-paper px-1.5 py-0.5 text-[10px] font-semibold text-ink/50">esc</kbd>
        </div>

        {summary && (
          <button type="button" onClick={() => go(summary.href)} className="w-full text-left px-4 py-3 border-b border-border bg-signal-soft/30 hover:bg-signal-soft/50 transition-colors">
            <div className="flex items-center gap-3">
              <span className="w-9 h-9 rounded-full bg-signal-soft text-signal-text flex items-center justify-center text-xs font-extrabold shrink-0">{summary.name.split(" ").map((p) => p[0]).join("").slice(0, 2)}</span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-extrabold text-ink">{summary.name}</div>
                <div className="text-xs text-ink/60">
                  {summary.conversations} conversation{summary.conversations === 1 ? "" : "s"} · {summary.bookings} booking{summary.bookings === 1 ? "" : "s"} · ${(summary.paidCents / 100).toLocaleString()} paid
                  {summary.nextAction && <span className="text-accent-text font-semibold"> · Next: {summary.nextAction}</span>}
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-ink/30" strokeWidth={2} />
            </div>
          </button>
        )}

        <ul id="cmd-list" role="listbox" className="max-h-[52vh] overflow-y-auto scrollbar-thin py-2">
          {loading && items.length === 0 && <li className="px-4 py-3 text-sm text-ink/50">Looking…</li>}
          {!loading && q.trim().length >= 2 && hits.length === 0 && (
            <li className="px-4 py-3 text-sm text-ink/50">Nothing on the thread matches “{q.trim()}”.</li>
          )}
          {items.map((it, i) => {
            const header = it.group !== lastGroup;
            lastGroup = it.group;
            const on = i === cursor;
            return (
              <li key={it.key} role="presentation">
                {header && <div className="px-4 pt-2 pb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-ink/40">{it.group}</div>}
                <button
                  id={`cmd-${it.key}`}
                  role="option"
                  aria-selected={on}
                  type="button"
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => go(it.href)}
                  className={cn("w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors", on ? "bg-black/[0.04]" : "hover:bg-black/[0.03]")}
                >
                  <span className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", on ? "bg-ink text-white" : "bg-black/[0.05] text-ink/60")}>
                    <it.icon className="w-4 h-4" strokeWidth={2} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-ink truncate">{it.title}</span>
                    {it.subtitle && <span className="block text-xs text-ink/55 truncate">{it.subtitle}</span>}
                  </span>
                  {on && <kbd className="hidden sm:inline text-[10px] font-semibold text-ink/40">⏎</kbd>}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
