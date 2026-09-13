"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";

/**
 * Search the inbox. Typing updates the URL's `q` (debounced) so the list is filtered on
 * the server, tenant-scoped, across names, handles, subjects and message text. The URL is
 * the state: a search survives reload and can be shared with a teammate.
 */
export function SearchBox({ initial }: { initial: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [value, setValue] = useState(initial);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setValue(initial), [initial]);

  useEffect(() => {
    const q = value.trim();
    // Only a real change to the search touches the URL. A mount (or React's development
    // double-run of effects) must never rewrite it — that used to drop the `c` parameter and
    // close the conversation a link had just opened.
    if (q === (params?.get("q") ?? "")) return;
    const t = setTimeout(() => {
      const next = new URLSearchParams(params?.toString() ?? "");
      if (q) next.set("q", q);
      else next.delete("q");
      next.delete("c");
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    }, 220);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="relative">
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink/60 pointer-events-none" strokeWidth={2} aria-hidden />
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && setValue("")}
        placeholder="Search people and messages"
        aria-label="Search the inbox"
        enterKeyHint="search"
        className="w-full h-10 md:h-8 rounded border border-border-strong bg-white pl-8 pr-9 text-[16px] md:text-13 text-ink placeholder:text-ink/50 outline-none transition-[border-color,box-shadow] hover:border-ink/25 focus:border-ink/45 focus:ring-[3px] focus:ring-ink/[0.07] [&::-webkit-search-cancel-button]:hidden"
      />
      {value ? (
        <button type="button" onClick={() => setValue("")} aria-label="Clear search" className="absolute right-1.5 top-1/2 -translate-y-1/2 w-7 h-7 [@media(pointer:coarse)]:w-11 [@media(pointer:coarse)]:h-11 rounded-lg flex items-center justify-center text-ink/65 hover:text-ink hover:bg-ink/[0.05]">
          <X className="w-3.5 h-3.5" strokeWidth={2.5} aria-hidden />
        </button>
      ) : (
        <kbd className="hidden md:inline-flex absolute right-2 top-1/2 -translate-y-1/2 items-center rounded border border-ink/10 bg-white px-1 h-4 text-[10.5px] font-medium text-ink/60">/</kbd>
      )}
    </div>
  );
}
