import Link from "next/link";
import { LinkButton } from "@/components/ui";

export const metadata = {
  title: "LensFlow — On your phone",
  description: "Leads, bookings, payments, and delivery — manage your business from your phone. No app to download.",
};

// Public, no-auth landing page — the destination for the "scan to try LensFlow on your
// phone" QR code. Must load instantly and never require a session.
export default function MobilePage() {
  return (
    <main className="min-h-screen bg-paper flex flex-col">
      <nav className="flex items-center justify-center px-6 py-8">
        <span className="font-display text-xl text-ink">LensFlow</span>
      </nav>

      <div className="flex-1 flex flex-col items-center justify-center px-6 pb-16 text-center max-w-sm mx-auto w-full">
        <div className="w-14 h-14 rounded-2xl bg-accent-soft flex items-center justify-center mb-6">
          <PhoneIcon />
        </div>

        <h1 className="font-display text-3xl leading-[1.15] text-ink mb-3">LensFlow is on your phone.</h1>
        <p className="text-[15px] text-ink/55 leading-[22px] mb-10">
          Leads, bookings, payments, and delivery — run your whole business from wherever you're working. No app to
          download, nothing to install.
        </p>

        <div className="w-full flex flex-col gap-3">
          <LinkButton href="/demo" size="lg" variant="secondary" className="w-full !h-12 !text-[15px]">
            Open LensFlow
          </LinkButton>
          <LinkButton href="/login" size="lg" variant="outline" className="w-full !h-12 !text-[15px]">
            Try it in your browser
          </LinkButton>
        </div>

        <p className="text-xs text-ink/40 mt-6">Works instantly in Safari or Chrome — no install required.</p>
      </div>

      <footer className="px-6 py-6 text-center">
        <Link href="/" className="text-xs text-ink/35 hover:text-ink/55">
          lensflow.app
        </Link>
      </footer>
    </main>
  );
}

function PhoneIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="6" y="2" width="12" height="20" rx="2.5" stroke="#A8481F" strokeWidth="1.6" />
      <line x1="10" y1="18.5" x2="14" y2="18.5" stroke="#A8481F" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
