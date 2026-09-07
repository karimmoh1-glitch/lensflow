import Link from "next/link";
import { LogoMark } from "@/components/Logo";

/** The last thing on the page: who made this, where the legal pages are, how to reach a person. */
export function Footer() {
  return (
    <footer className="bg-midnight text-paper/60 border-t border-graphite-border">
      <div className="max-w-[1200px] mx-auto px-6 py-10 md:py-12 flex flex-col md:flex-row md:items-center gap-6 md:gap-10">
        <Link href="/" className="inline-flex items-center gap-2 text-paper"><LogoMark className="w-5 h-5" /><span className="font-sans font-extrabold text-[17px] tracking-tight">Daythread</span></Link>
        <p className="text-sm max-w-md md:flex-1">Every conversation, booking and calendar on one thread — and what to do next.</p>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <Link href="/#pricing" className="hover:text-paper transition-colors">Pricing</Link>
          <Link href="/support" className="hover:text-paper transition-colors">Support</Link>
          <Link href="/status" className="hover:text-paper transition-colors">Status</Link>
          <Link href="/privacy" className="hover:text-paper transition-colors">Privacy</Link>
          <Link href="/terms" className="hover:text-paper transition-colors">Terms</Link>
          <Link href="/login" className="hover:text-paper transition-colors">Log in</Link>
        </nav>
      </div>
      <div className="max-w-[1200px] mx-auto px-6 pb-8 text-xs text-paper/60">© {new Date().getFullYear()} Daythread · support@daythread.org</div>
    </footer>
  );
}
