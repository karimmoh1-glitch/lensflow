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
        className={cn(
          "w-full flex items-center justify-between transition-all duration-300 ease-out",
          scrolled
            ? "max-w-3xl px-5 py-2.5 rounded-full border border-border bg-white/90 backdrop-blur-md shadow-[0_2px_24px_-8px_rgba(16,17,20,0.12)]"
            : "max-w-6xl px-2 py-2 rounded-full border border-transparent bg-transparent"
        )}
      >
        <Link href="/" aria-label="Daythread home">
          <Logo />
        </Link>
        <div className="flex items-center gap-6">
          <Link href="#how" className="hidden sm:block text-[13px] font-semibold text-ink/70 hover:text-ink transition-colors">
            How it works
          </Link>
          <Link href="#pricing" className="hidden sm:block text-[13px] font-semibold text-ink/70 hover:text-ink transition-colors">
            Pricing
          </Link>
          <Link href="/login" className="text-[13px] font-semibold text-ink/70 hover:text-ink transition-colors">
            Log in
          </Link>
          <Link
            href="/signup"
            className="text-[13px] font-extrabold text-paper bg-ink hover:bg-black rounded-full px-4 py-2 transition-all duration-150 hover:scale-[1.05] active:scale-[0.95]"
          >
            Start free
          </Link>
        </div>
      </nav>
    </div>
  );
}
