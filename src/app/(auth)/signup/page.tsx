import Link from "next/link";
import { AuthShell } from "@/components/auth/AuthShell";

export default function SignupChooserPage() {
  return (
    <AuthShell
      eyebrow="Start"
      title="Your business, or someone else's?"
      footer={
        <>
          Already on Daythread?{" "}
          <Link href="/login" className="font-semibold text-ink hover:text-accent-text transition-colors">
            Log in
          </Link>
        </>
      }
    >
      <div className="space-y-3">
        <Choice
          href="/signup/create"
          title="Start my own"
          body="I run a business. Put my messages, clients, bookings and payments on one thread."
          tone="accent"
        />
        <Choice href="/signup/join" title="Join a team" body="I work with a business that already uses Daythread." tone="signal" />
      </div>
    </AuthShell>
  );
}

function Choice({ href, title, body, tone }: { href: string; title: string; body: string; tone: "accent" | "signal" }) {
  return (
    <Link
      href={href}
      className="group flex items-start gap-4 rounded-2xl border border-border bg-white px-5 py-4 transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:border-ink/25 hover:-translate-y-0.5 hover:shadow-popover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
    >
      <span aria-hidden className={`mt-1.5 w-2.5 h-2.5 rounded-full shrink-0 ${tone === "accent" ? "bg-accent" : "bg-signal"}`} />
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-extrabold text-ink tracking-tight">{title}</span>
        <span className="block text-sm text-ink/60 mt-0.5 leading-relaxed">{body}</span>
      </span>
      <span aria-hidden className="mt-1 text-ink/30 transition-all duration-200 group-hover:text-ink group-hover:translate-x-0.5">→</span>
    </Link>
  );
}
