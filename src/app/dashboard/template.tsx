/**
 * Re-mounted on every navigation inside the app, so each page settles in (dt-swap: a short
 * rise and fade, --dt-smooth) instead of cutting. It's also what makes "you're in" feel
 * like a moment after login: the first dashboard paint arrives the same way. Reduced
 * motion turns the animation off in globals.css.
 */
export default function DashboardTemplate({ children }: { children: React.ReactNode }) {
  return <div className="dt-swap min-w-0">{children}</div>;
}
