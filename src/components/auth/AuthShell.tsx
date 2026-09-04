import Link from "next/link";
import { LogoMark } from "@/components/Logo";
import { AuthEnvironment } from "./AuthEnvironment";

/**
 * The room every sign-in, sign-up, reset and invite page happens in. An asymmetric split:
 * on the left, a living miniature of the product — messages from the channels a customer
 * already uses, quietly becoming one thread; on the right, the form, given real room and
 * real typography. On phones the environment becomes a short strip above the form.
 *
 * One component so login, signup, forgot, reset, invite and workspace selection can never
 * drift into looking like different products.
 */
export function AuthShell({
  eyebrow,
  title,
  lede,
  children,
  footer,
  back,
}: {
  eyebrow?: string;
  title: string;
  lede?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <main className="min-h-screen bg-paper lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      {/* Environment */}
      <section aria-hidden className="relative bg-midnight text-paper overflow-hidden lg:min-h-screen">
        <div className="absolute inset-0 bg-[radial-gradient(60%_50%_at_30%_30%,rgba(109,90,230,0.22),transparent_70%),radial-gradient(50%_40%_at_80%_80%,rgba(240,82,77,0.14),transparent_70%)]" />
        <div className="relative flex flex-col h-full px-6 py-6 lg:px-12 lg:py-10">
          <Link href="/" className="inline-flex items-center gap-2.5 text-paper w-fit">
            <LogoMark className="w-6 h-6" />
            <span className="font-sans font-extrabold text-lg tracking-tight">Daythread</span>
          </Link>
          <div className="mt-6 lg:mt-auto lg:mb-auto">
            <AuthEnvironment />
          </div>
          <p className="hidden lg:block mt-auto text-sm text-paper/45 max-w-sm">Every message, client, booking and payment. One thread.</p>
        </div>
      </section>

      {/* Form */}
      <section className="flex items-start lg:items-center justify-center px-6 py-10 lg:py-16">
        <div className="w-full max-w-sm dt-swap">
          {back && (
            <Link href={back.href} className="inline-flex items-center gap-1 text-xs font-semibold text-ink/50 hover:text-ink transition-colors mb-6">
              <span aria-hidden>←</span> {back.label}
            </Link>
          )}
          {eyebrow && <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink/45 mb-3">{eyebrow}</p>}
          <h1 className="font-sans font-extrabold text-[2rem] leading-[1.05] tracking-[-0.035em] text-ink">{title}</h1>
          {lede && <p className="mt-3 text-sm text-ink/65 leading-relaxed">{lede}</p>}
          <div className="mt-8">{children}</div>
          {footer && <div className="mt-8 text-sm text-ink/60">{footer}</div>}
        </div>
      </section>
    </main>
  );
}
