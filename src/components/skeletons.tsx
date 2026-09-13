import { Skeleton } from "@/components/ui";

/**
 * Loading states drawn in the shape of the page that is coming, so nothing jumps when the
 * real content lands and nobody watches a spinner in the middle of an empty screen. Each
 * one is announced once as busy; the shapes are decorative.
 */
function Frame({ label, width = "max-w-4xl", children }: { label: string; width?: string; children: React.ReactNode }) {
  return (
    <div className={`${width} mx-auto px-6 md:px-8 py-8 md:py-10`} aria-busy="true" aria-label={label} role="status">
      {children}
    </div>
  );
}

function Header({ action = true }: { action?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6">
      <div className="space-y-2">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-3.5 w-56" />
      </div>
      {action && <Skeleton className="h-9 w-28 rounded-lg" />}
    </div>
  );
}

function Rows({ n = 6, meta = true }: { n?: number; meta?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-white divide-y divide-border">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3">
          <Skeleton className="w-8 h-8 rounded-full shrink-0" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5" style={{ width: `${34 + ((i * 17) % 30)}%` }} />
            {meta && <Skeleton className="h-3" style={{ width: `${48 + ((i * 11) % 34)}%` }} />}
          </div>
          <Skeleton className="h-3 w-12 shrink-0" />
        </div>
      ))}
    </div>
  );
}

export function TodaySkeleton() {
  return (
    <Frame label="Loading today">
      <div className="mb-8 space-y-2">
        <Skeleton className="h-3.5 w-36" />
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-3.5 w-80" />
      </div>
      <Skeleton className="h-3.5 w-24 mb-3" />
      <div className="rounded-lg border border-border bg-white p-5 flex gap-3.5">
        <Skeleton className="w-10 h-10 rounded-full shrink-0" />
        <div className="flex-1 space-y-2.5">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-3.5 w-3/4" />
          <div className="flex gap-2 pt-1"><Skeleton className="h-9 w-28 rounded-lg" /><Skeleton className="h-9 w-28 rounded-lg" /></div>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] gap-8 mt-10">
        <div><Skeleton className="h-3.5 w-16 mb-3" /><Rows n={3} /></div>
        <div><Skeleton className="h-3.5 w-28 mb-3" /><Rows n={3} /></div>
      </div>
    </Frame>
  );
}

export function ListSkeleton({ label, rows = 7, action = true }: { label: string; rows?: number; action?: boolean }) {
  return (
    <Frame label={label}>
      <Header action={action} />
      <div className="flex gap-2 mb-4"><Skeleton className="h-7 w-20 rounded-md" /><Skeleton className="h-7 w-16 rounded-md" /><Skeleton className="h-7 w-20 rounded-md" /></div>
      <Rows n={rows} />
    </Frame>
  );
}

export function CalendarSkeleton() {
  return (
    <Frame label="Loading your calendar" width="max-w-6xl">
      <Header />
      <div className="grid grid-cols-7 gap-2 mb-6">{Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}</div>
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-4">
        <Rows n={4} />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    </Frame>
  );
}

export function DetailSkeleton({ label }: { label: string }) {
  return (
    <Frame label={label}>
      <Header action={false} />
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4"><Skeleton className="h-44 rounded-xl" /><Skeleton className="h-28 rounded-xl" /></div>
        <div className="space-y-4"><Skeleton className="h-32 rounded-xl" /><Skeleton className="h-40 rounded-xl" /></div>
      </div>
    </Frame>
  );
}

export function SettingsSkeleton() {
  return (
    <Frame label="Loading settings" width="max-w-5xl">
      <div className="grid md:grid-cols-[200px_minmax(0,1fr)] gap-8">
        <div className="hidden md:block space-y-2">{Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="h-8 rounded-lg" />)}</div>
        <div><Header action={false} /><Rows n={5} /></div>
      </div>
    </Frame>
  );
}
