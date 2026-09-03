import Link from "next/link";
import { LogoMark } from "@/components/Logo";
import { LinkButton } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="min-h-screen bg-paper flex flex-col items-center justify-center px-6 text-center">
      <LogoMark className="w-8 h-8 mb-6 text-ink" />
      <h1 className="font-sans font-black text-3xl tracking-tight text-ink mb-2">Page not found.</h1>
      <p className="text-sm text-ink/70 mb-8 max-w-sm">
        This page doesn&apos;t exist, or the link may be out of date.
      </p>
      <LinkButton href="/" className="font-bold">
        Back to Daythread
      </LinkButton>
      <Link href="/login" className="mt-4 text-xs text-ink/60 hover:text-ink transition-colors">
        Log in instead
      </Link>
    </main>
  );
}
