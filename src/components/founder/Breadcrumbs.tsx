import Link from "next/link";

export type BreadcrumbItem = { name: string; href: string };

/** Visible breadcrumb trail; the last item is the current page and is not a link. */
export function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-13 text-ink/65">
        {items.map((item, i) => {
          const last = i === items.length - 1;
          return (
            <li key={item.href} className="flex items-center gap-x-1.5">
              {last ? (
                <span aria-current="page" className="text-ink">{item.name}</span>
              ) : (
                <>
                  <Link
                    href={item.href}
                    className="inline-flex min-h-6 items-center rounded-sm hover:text-ink hover:underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/70 focus-visible:ring-offset-2"
                  >
                    {item.name}
                  </Link>
                  <span aria-hidden className="text-ink/40">/</span>
                </>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
