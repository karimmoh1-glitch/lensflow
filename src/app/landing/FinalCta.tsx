import Link from "next/link";
import { LogoMark } from "@/components/Logo";
import { RevealOnScroll } from "../RevealOnScroll";

/** The end of the film. Dark, quiet, one line, one button. */
export function FinalCta() {
  return (
    <section className="relative bg-midnight text-paper px-6 pt-28 md:pt-40 pb-12 overflow-hidden">
      <svg className="absolute inset-x-0 top-0 w-full h-[220px] opacity-70" viewBox="0 0 1440 220" preserveAspectRatio="none" fill="none" aria-hidden>
        <defs>
          <linearGradient id="dt-end-grad" x1="0" x2="1">
            <stop offset="0" stopColor="#F0524D" />
            <stop offset="0.5" stopColor="#6D5AE6" />
            <stop offset="1" stopColor="#13CC78" />
          </linearGradient>
        </defs>
        <path d="M -20 170 C 300 170, 420 40, 720 40 S 1140 170, 1460 170" stroke="url(#dt-end-grad)" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <RevealOnScroll className="relative max-w-2xl mx-auto text-center">
        <p className="font-sans font-extrabold text-[clamp(2.4rem,6vw,4.75rem)] leading-[0.94] tracking-[-0.045em] text-balance">
          <span className="text-paper/35">It started scattered.</span>
          <br />
          Now it&rsquo;s one thread.
        </p>
        <div className="mt-10 flex flex-col items-center gap-3">
          <Link
            href="/signup"
            className="inline-flex items-center gap-2 h-13 px-7 py-3.5 rounded-full bg-accent text-white text-base font-extrabold shadow-[0_14px_36px_-12px_rgba(240,82,77,0.8)] transition-transform duration-150 hover:scale-[1.04] hover:-translate-y-0.5 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-midnight"
          >
            Build your Daythread <span aria-hidden>→</span>
          </Link>
          <span className="text-sm text-paper/45">Free to start · no card</span>
        </div>
      </RevealOnScroll>
      <footer className="relative max-w-6xl mx-auto mt-28 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-paper/40">
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
