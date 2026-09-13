import { Skeleton } from "@/components/ui";

/** The list's own shape while the server gathers conversations: no spinner, no jump when
 * the real rows land. Announced once as busy. */
export default function Loading() {
  return (
    <div className="flex h-full min-h-0 bg-white" role="status" aria-busy="true" aria-label="Loading your inbox">
      <div className="w-full lg:w-[380px] xl:w-[400px] shrink-0 border-r border-border flex flex-col">
        <div className="px-3 md:px-4 pt-2.5 pb-2 border-b border-border space-y-2">
          <div className="flex items-center gap-2 h-9 pl-1"><Skeleton className="h-4 w-12" /><Skeleton className="h-7 w-24 rounded-lg" /><Skeleton className="ml-auto h-8 w-8 rounded-lg" /></div>
          <Skeleton className="h-8 w-full rounded-lg" />
          <div className="flex gap-1.5"><Skeleton className="h-7 w-20 rounded-md" /><Skeleton className="h-7 w-16 rounded-md" /><Skeleton className="h-7 w-16 rounded-md" /></div>
        </div>
        <div className="divide-y divide-border">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="flex items-start gap-3 pl-4 pr-3 md:pl-5 md:pr-4 py-2.5">
              <Skeleton className="mt-0.5 w-8 h-8 rounded-full shrink-0" />
              <div className="flex-1 space-y-2 pt-0.5">
                <div className="flex justify-between"><Skeleton className="h-3.5" style={{ width: `${30 + ((i * 13) % 25)}%` }} /><Skeleton className="h-3 w-7" /></div>
                <Skeleton className="h-3" style={{ width: `${55 + ((i * 17) % 35)}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="hidden lg:block flex-1 bg-paper" />
    </div>
  );
}
