import { FounderHeader } from "@/components/founder/FounderHeader";
import { Footer } from "@/app/landing/Footer";

export default function FounderLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-canvas text-ink">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-10 focus:rounded focus:bg-ink focus:px-3 focus:py-2 focus:text-sm focus:text-canvas"
      >
        Skip to content
      </a>
      <FounderHeader />
      <main id="main" className="flex-1">
        {children}
      </main>
      <Footer />
    </div>
  );
}
