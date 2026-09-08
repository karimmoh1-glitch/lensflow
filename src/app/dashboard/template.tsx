/**
 * Re-mounted on every navigation inside the app, so each page settles in (dt-swap: a short
 * rise and fade, --dt-smooth) instead of cutting. It's also what makes "you're in" feel
 * like a moment after login: the first dashboard paint arrives the same way. Reduced
 * motion turns the animation off in globals.css.
 *
 * It carries the shell's height through to the page (h-full, and a min-h-0 so it may shrink
 * inside the scrolling <main>): a page that sizes itself to the region it was given — the
 * inbox, with its own scrolling list — needs an unbroken chain of definite heights, and an
 * auto-height wrapper here would silently turn that into a page as tall as its content.
 */
export default function DashboardTemplate({ children }: { children: React.ReactNode }) {
  return <div className="dt-swap min-w-0 h-full min-h-0">{children}</div>;
}
