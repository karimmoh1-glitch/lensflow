import Link from "next/link";
import { LinkButton } from "@/components/ui";
import { PhoneStory } from "./PhoneStory";

export const metadata = { title: "LensFlow — Your studio, in your pocket" };

export default function MobilePage() {
  return (
    <main className="min-h-screen bg-paper">
      <nav className="max-w-5xl mx-auto flex items-center justify-between px-6 py-6">
        <Link href="/" className="font-display text-xl">
          LensFlow
        </Link>
        <div className="flex items-center gap-3">
          <Link href="/login" className="text-sm font-medium text-ink/70 hover:text-ink">
            Log in
          </Link>
          <LinkButton href="/signup" size="sm">
            Start free
          </LinkButton>
        </div>
      </nav>

      <section className="max-w-2xl mx-auto px-6 pt-10 pb-16 text-center">
        <h1 className="font-display text-4xl md:text-5xl leading-[1.15] text-ink">Your studio. In your pocket.</h1>
        <p className="mt-4 text-base text-ink/55 max-w-md mx-auto">
          Leads, bookings, payments, and delivery — manage all of it from your phone, wherever the shoot takes you.
        </p>
      </section>

      <section className="max-w-5xl mx-auto px-6 pb-24">
        <PhoneStory />
      </section>

      <section className="max-w-lg mx-auto px-6 pb-28 text-center">
        <h2 className="font-display text-2xl text-ink mb-2">Everything you need. Wherever you are.</h2>
        <p className="text-sm text-ink/50 mb-1">Built for mobile — use it right from your phone's browser, no app to install.</p>
        <div className="mt-6">
          <LinkButton href="/signup" size="lg">
            Get started
          </LinkButton>
        </div>
      </section>
    </main>
  );
}
