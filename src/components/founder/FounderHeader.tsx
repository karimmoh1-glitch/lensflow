import Link from "next/link";
import { LogoMark } from "@/components/Logo";
import { FounderNav } from "./FounderNav";

export function FounderHeader() {
  return (
    <header className="border-b border-border bg-canvas">
      <div className="mx-auto flex max-w-[1120px] items-center justify-between gap-2 px-4 py-2 sm:px-6">
        <Link
          href="/"
          className="-ml-2 inline-flex min-h-10 min-w-10 items-center justify-center gap-2 rounded-sm px-2 text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/70 focus-visible:ring-offset-2"
        >
          <LogoMark className="h-5 w-5 shrink-0" />
          <span className="sr-only sm:not-sr-only text-sm font-semibold tracking-tight">Daythread</span>
        </Link>
        <FounderNav />
      </div>
    </header>
  );
}
