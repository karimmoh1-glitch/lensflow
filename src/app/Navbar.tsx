"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { cn } from "@/lib/utils";

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav
      className={cn(
        "sticky top-0 z-30 w-full flex items-center justify-between px-6 py-4 transition-all duration-300",
        scrolled ? "bg-paper/80 backdrop-blur-md border-b border-border shadow-xs" : "bg-transparent border-b border-transparent"
      )}
    >
      <Link href="/" aria-label="Daythread home">
        <Logo />
      </Link>
      <div className="flex items-center gap-6">
        <Link href="#pricing" className="hidden sm:block text-sm font-medium text-ink/65 hover:text-ink transition-colors">
          Pricing
        </Link>
        <Link href="/login" className="text-sm font-medium text-ink/65 hover:text-ink transition-colors">
          Log in
        </Link>
        <Link
          href="/signup"
          className="text-sm font-medium text-paper bg-ink hover:bg-black rounded-full px-4 py-2 transition-colors shadow-xs"
        >
          Start Free
        </Link>
      </div>
    </nav>
  );
}
