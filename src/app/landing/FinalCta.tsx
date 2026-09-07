"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CalendarDays, Sparkles, Zap, Inbox } from "lucide-react";
import { LogoMark } from "@/components/Logo";
import { cn } from "@/lib/utils";
import { ChannelIcon, type ChannelKey } from "./ChannelIcon";

/**
 * The end of the film: everything the page showed, on one thread. The channels on the left
 * draw into the Daythread mark; the inbox, calendar, automations and assistant come off it
 * on the right. The thread draws itself once more across the dark sheet, then the line the
 * whole story was building to, and the one button. Reduced motion: the finished picture.
 */
const CHANNELS: ChannelKey[] = ["instagram", "gmail", "whatsapp", "sms", "website"];
const OUTPUTS = [
  { icon: Inbox, label: "Inbox" },
  { icon: CalendarDays, label: "Calendar" },
  { icon: Zap, label: "Automations" },
  { icon: Sparkles, label: "Assistant" },
];

export function FinalCta() {
  const ref = useRef<HTMLElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && (setInView(true), io.disconnect()), { threshold: 0.25 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <section id="end" ref={ref} className="relative bg-midnight text-paper px-6 pt-24 md:pt-32 pb-12 overflow-hidden scroll-mt-16">
      {/* everything, on one thread */}
      <div className="relative max-w-[880px] mx-auto">
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 880 220" preserveAspectRatio="none" fill="none" aria-hidden>
          <defs>
            <linearGradient id="dt-end-grad" x1="0" x2="1">
              <stop offset="0" stopColor="#F0524D" />
              <stop offset="0.5" stopColor="#6D5AE6" />
              <stop offset="1" stopColor="#13CC78" />
            </linearGradient>
          </defs>
          {CHANNELS.map((k, i) => {
            const y = 30 + i * 40;
            return <path key={k} className={cn("dt-draw", inView && "is-in")} style={{ animationDelay: `${i * 90}ms` }} d={`M 60 ${y} C 250 ${y}, 300 110, 440 110`} stroke="url(#dt-end-grad)" strokeOpacity="0.85" strokeWidth="1.5" strokeLinecap="round" pathLength={1} />;
          })}
          {OUTPUTS.map((o, i) => {
            const y = 50 + i * 40;
            return <path key={o.label} className={cn("dt-draw", inView && "is-in")} style={{ animationDelay: `${600 + i * 90}ms` }} d={`M 440 110 C 560 110, 610 ${y}, 745 ${y}`} stroke="url(#dt-end-grad)" strokeOpacity="0.85" strokeWidth="1.5" strokeLinecap="round" pathLength={1} />;
          })}
        </svg>
        <div className="relative grid grid-cols-[auto_1fr_auto] items-center h-[220px]">
          <ul className="flex flex-col justify-between h-[190px] -mt-[10px]" aria-label="Channels">
            {CHANNELS.map((k, i) => (
              <li key={k} className={cn(inView ? "dt-land" : "opacity-0")} style={{ animationDelay: `${i * 90}ms` }}>
                <ChannelIcon k={k} size={30} />
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-center">
            <span className={cn("w-16 h-16 md:w-20 md:h-20 rounded-full bg-paper text-ink flex items-center justify-center shadow-[0_0_0_10px_rgba(250,250,249,0.06),0_24px_60px_-20px_rgba(240,82,77,0.5)]", inView ? "dt-land" : "opacity-0")} style={{ animationDelay: "420ms" }}>
              <LogoMark className="w-8 h-8 md:w-10 md:h-10" />
            </span>
          </div>
          <ul className="flex flex-col justify-between h-[150px]" aria-label="What comes off the thread">
            {OUTPUTS.map((o, i) => (
              <li key={o.label} className={cn("flex items-center gap-2 text-[13px] font-semibold text-paper/85", inView ? "dt-land" : "opacity-0")} style={{ animationDelay: `${700 + i * 90}ms` }}>
                <span className="w-7 h-7 rounded-lg bg-paper/10 flex items-center justify-center"><o.icon className="w-3.5 h-3.5" strokeWidth={2} aria-hidden /></span>
                <span className="sr-only sm:not-sr-only">{o.label}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className={cn("relative max-w-3xl mx-auto text-center mt-16 md:mt-20", inView ? "dt-land" : "opacity-0")} style={{ animationDelay: "900ms" }}>
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-paper/60 mb-6">Meet Daythread</p>
        <p className="font-sans font-extrabold text-[clamp(2.6rem,6.4vw,5.5rem)] leading-[0.92] tracking-[-0.05em] text-balance">
          One inbox.<br />Everything connected.
        </p>
        <div className="mt-10 flex flex-col items-center gap-3">
          <Link
            href="/signup"
            className="group inline-flex items-center gap-2 h-14 px-8 rounded-full bg-accent-strong text-white text-base font-extrabold shadow-[0_16px_40px_-12px_rgba(240,82,77,0.85)] transition-all duration-200 ease-[cubic-bezier(0.22,1.2,0.36,1)] hover:scale-[1.04] hover:-translate-y-0.5 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-midnight"
          >
            Get started <span aria-hidden className="transition-transform duration-200 group-hover:translate-x-0.5">→</span>
          </Link>
          <span className="text-sm text-paper/60">Free to start. Pro is $20 a month when you need it.</span>
        </div>
      </div>
      <footer className="relative max-w-[1200px] mx-auto mt-24 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-paper/60">
        <span className="inline-flex items-center gap-2 text-paper/70"><LogoMark className="w-5 h-5" /><span className="font-extrabold tracking-tight text-sm">Daythread</span></span>
        <nav aria-label="Closing" className="flex items-center gap-6">
          <Link href="#pricing" className="hover:text-paper transition-colors">Pricing</Link>
          <Link href="#demo" className="hover:text-paper transition-colors">Try it</Link>
          <Link href="/login" className="hover:text-paper transition-colors">Log in</Link>
        </nav>
        <span>© {new Date().getFullYear()} Daythread</span>
      </footer>
    </section>
  );
}
