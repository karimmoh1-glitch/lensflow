"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { cn } from "@/lib/utils";

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="sticky top-0 z-30 w-full flex justify-center px-4 pt-4">
      <nav
        aria-label="Primary"
        className={cn(
          "w-full flex items-center justify-between transition-all duration-300 ease-out",
          scrolled
            ? "max-w-3xl pl-4 pr-1.5 py-1.5 rounded-2xl border border-border bg-white/90 backdrop-blur-md shadow-[0_2px_24px_-8px_rgba(16,17,20,0.12)]"
            : "max-w-[1200px] px-2 py-2 rounded-2xl border border-transparent bg-transparent"
        )}
      >
        <Link href="/" aria-label="Daythread home" className={cn("transition-transform duration-300 origin-left", scrolled && "scale-90")}>
          <Logo />
        </Link>
        <div className="flex items-center gap-3 sm:gap-6 whitespace-nowrap">
          <Link href="#flow" className="hidden sm:inline-flex items-center h-9 text-13 font-medium text-ink/65 hover:text-ink transition-colors">
            How it works
          </Link>
          <Link href="#pricing" className="hidden sm:inline-flex items-center h-9 text-13 font-medium text-ink/65 hover:text-ink transition-colors">
            Pricing
          </Link>
          <Link href="/login" className="inline-flex items-center h-9 text-13 font-medium text-ink/65 hover:text-ink transition-colors">
            Log in
          </Link>
          <Link
            href="/start"
            className="text-13 font-semibold text-paper bg-ink hover:bg-black rounded-lg px-3 sm:px-3.5 h-9 inline-flex items-center transition-[background-color,transform] duration-150 active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/70 focus-visible:ring-offset-2"
          >
            Start free
          </Link>
        </div>
      </nav>
    </div>
  );
}
