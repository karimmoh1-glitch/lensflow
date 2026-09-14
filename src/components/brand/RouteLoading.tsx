import { DaythreadLoader } from "./DaythreadLoader";

/** What a route shows while the server assembles it: the thread, nothing else. Used by
 * every dashboard `loading.tsx`, so navigation inside the product has one loading language. */
export function RouteLoading({ label }: { label?: string }) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center text-ink" aria-busy="true">
      <DaythreadLoader label={label} />
    </div>
  );
}
