"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { LogoMark } from "@/components/Logo";
import { cn } from "@/lib/utils";

/**
 * The end of the film. The thread that opened the site draws itself once more, across a
 * dark sheet this time, and the page closes on the line the whole story was building to.
 */
export function FinalCta() {
  const ref = useRef<HTMLElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && (setInView(true), io.disconnect()), { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <section ref={ref} className="relative bg-midnight text-paper px-6 pt-32 md:pt-44 pb-12 overflow-hidden">
      <svg className="absolute inset-x-0 top-0 w-full h-[260px]" viewBox="0 0 1440 260" preserveAspectRatio="none" fill="none" aria-hidden>
        <defs>
          <linearGradient id="dt-end-grad" x1="0" x2="1">
            <stop offset="0" stopColor="#F0524D" />
            <stop offset="0.5" stopColor="#6D5AE6" />
            <stop offset="1" stopColor="#13CC78" />
          </linearGradient>
        </defs>
        <path className={cn("dt-draw", inView && "is-in")} d="M -20 200 C 300 200, 420 50, 720 50 S 1140 200, 1460 200" stroke="url(#dt-end-grad)" strokeWidth="2.5" strokeLinecap="round" pathLength={1} />
      </svg>
      <div className={cn("relative max-w-3xl mx-auto text-center", inView ? "dt-land" : "opacity-0")} style={{ animationDelay: "500ms" }}>
        <p className="font-sans font-extrabold text-[clamp(2.6rem,6.4vw,5.5rem)] leading-[0.92] tracking-[-0.05em] text-balance">
          Your business,<br />finally on one thread.
        </p>
        <div className="mt-10 flex flex-col items-center gap-3">
          <Link
            href="/signup"
            className="group inline-flex items-center gap-2 h-14 px-8 rounded-full bg-accent text-white text-base font-extrabold shadow-[0_16px_40px_-12px_rgba(240,82,77,0.85)] transition-all duration-200 ease-[cubic-bezier(0.22,1.2,0.36,1)] hover:scale-[1.04] hover:-translate-y-0.5 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-midnight"
          >
            Start for free <span aria-hidden className="transition-transform duration-200 group-hover:translate-x-0.5">→</span>
          </Link>
          <span className="text-sm text-paper/45">No card. Pro is $29 when you need it.</span>
        </div>
      </div>
      <footer className="relative max-w-[1200px] mx-auto mt-28 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-paper/40">
        <span className="inline-flex items-center gap-2 text-paper/70"><LogoMark className="w-5 h-5" /><span className="font-extrabold tracking-tight text-sm">Daythread</span></span>
        <nav className="flex items-center gap-6">
          <Link href="#pricing" className="hover:text-paper transition-colors">Pricing</Link>
          <Link href="/demo" className="hover:text-paper transition-colors">Live demo</Link>
          <Link href="/login" className="hover:text-paper transition-colors">Log in</Link>
        </nav>
        <span>© {new Date().getFullYear()} Daythread</span>
      </footer>
    </section>
  );
}
