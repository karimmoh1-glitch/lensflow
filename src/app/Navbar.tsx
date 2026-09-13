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

  // A plain bar that stays put. It gains a hairline once the page moves under it — no glass,
  // no shrinking pill: the navigation is not the show.
  return (
    <div className={cn("sticky top-0 z-30 w-full bg-paper transition-[border-color,background-color] duration-200 border-b", scrolled ? "border-border bg-white" : "border-transparent")}>
      <nav aria-label="Primary" className="max-w-[1200px] mx-auto h-16 px-6 flex items-center justify-between">
        <Link href="/" aria-label="Daythread home" className="inline-flex items-center min-h-[40px]">
          <Logo />
        </Link>
        <div className="flex items-center gap-3 sm:gap-7 whitespace-nowrap">
          <Link href="/#flow" className="hidden sm:inline-flex items-center h-9 text-13 font-medium text-ink/70 hover:text-ink transition-colors">
            How it works
          </Link>
          <Link href="/#pricing" className="hidden sm:inline-flex items-center h-9 text-13 font-medium text-ink/70 hover:text-ink transition-colors">
            Pricing
          </Link>
          <Link href="/login" className="inline-flex items-center h-9 text-13 font-medium text-ink/70 hover:text-ink transition-colors">
            Log in
          </Link>
          <Link
            href="/start"
            className="text-13 font-medium text-white bg-ink hover:bg-[#2A2B30] rounded px-3.5 h-9 inline-flex items-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/70 focus-visible:ring-offset-2"
          >
            Start free
          </Link>
        </div>
      </nav>
    </div>
  );
}
