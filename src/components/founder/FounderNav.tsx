"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/karim-mohamed", label: "Karim Mohamed", match: (p: string) => p === "/karim-mohamed" },
  { href: "/karim-mohamed/projects", label: "Projects", match: (p: string) => p.startsWith("/karim-mohamed/projects") },
  { href: "/karim-mohamed/writing", label: "Writing", match: (p: string) => p.startsWith("/karim-mohamed/writing") },
];

/** The founder section's three links. The current one is marked for assistive tech and by an underline. */
export function FounderNav() {
  const pathname = usePathname() ?? "";
  return (
    <nav aria-label="Founder">
      <ul className="flex items-center sm:gap-x-2">
        {LINKS.map((l) => {
          const current = l.match(pathname);
          return (
            <li key={l.href}>
              <Link
                href={l.href}
                aria-current={pathname === l.href ? "page" : current ? "true" : undefined}
                className={cn(
                  "inline-flex min-h-10 items-center whitespace-nowrap rounded-sm px-1.5 text-13 sm:px-2 sm:text-sm transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/70 focus-visible:ring-offset-2",
                  current ? "text-ink underline decoration-ink/40 underline-offset-[6px]" : "text-ink/65 hover:text-ink"
                )}
              >
                {l.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
