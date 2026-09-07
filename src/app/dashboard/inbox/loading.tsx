import { Skeleton } from "@/components/ui";

/** The list's own shape while the server gathers conversations: no spinner, no jump when
 * the real rows land. Announced once as busy. */
export default function Loading() {
  return (
    <div className="flex h-[100dvh] md:h-screen bg-white" aria-busy="true" aria-label="Loading your inbox">
      <div className="w-full lg:w-[380px] xl:w-[400px] shrink-0 border-r border-border flex flex-col">
        <div className="px-4 md:px-5 pt-3 md:pt-4 pb-3 border-b border-border space-y-3">
          <div className="flex items-center justify-between"><Skeleton className="h-6 w-16" /><Skeleton className="h-7 w-28 rounded-full" /></div>
          <Skeleton className="h-10 md:h-9 w-full rounded-xl" />
          <Skeleton className="h-4 w-2/3" />
          <div className="flex gap-1.5"><Skeleton className="h-7 w-24 rounded-full" /><Skeleton className="h-7 w-16 rounded-full" /><Skeleton className="h-7 w-20 rounded-full" /></div>
        </div>
        <ol className="flex-1">
          {Array.from({ length: 7 }).map((_, i) => (
            <li key={i} className="px-4 md:px-5 py-3.5 border-b border-border" style={{ opacity: 1 - i * 0.1 }}>
              <div className="flex items-center gap-3 mb-2"><Skeleton className="w-9 h-9 rounded-full" /><Skeleton className="h-3.5 w-1/3" /><Skeleton className="h-3 w-8 ml-auto" /></div>
              <div className="pl-12 space-y-1.5"><Skeleton className="h-3 w-1/4" /><Skeleton className="h-3 w-5/6" /></div>
            </li>
          ))}
        </ol>
      </div>
      <div className="hidden lg:flex flex-1" />
    </div>
  );
}
