import { cn } from "@/lib/utils";

export function PhoneFrame({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("relative w-[300px] h-[610px] shrink-0", className)}>
      <div className="absolute inset-0 rounded-[2.75rem] bg-ink shadow-popover" />
      <div className="absolute inset-[6px] rounded-[2.35rem] bg-white overflow-hidden flex flex-col">
        {/* status bar */}
        <div className="relative flex items-center justify-between px-6 pt-3 pb-1 shrink-0">
          <span className="text-[11px] font-medium text-ink">9:41</span>
          <div className="absolute left-1/2 -translate-x-1/2 top-2 w-24 h-6 rounded-full bg-ink" />
          <span className="text-[11px] font-medium text-ink">100%</span>
        </div>
        {/* screen content */}
        <div className="flex-1 min-h-0 relative">{children}</div>
        {/* home indicator */}
        <div className="flex justify-center pb-1.5 pt-1 shrink-0">
          <div className="w-28 h-1 rounded-full bg-ink/20" />
        </div>
      </div>
    </div>
  );
}

export function PhoneBottomNav({ active }: { active: "inbox" | "calendar" | "bookings" | "payments" }) {
  const items: { key: typeof active; label: string }[] = [
    { key: "inbox", label: "Inbox" },
    { key: "calendar", label: "Calendar" },
    { key: "bookings", label: "Bookings" },
    { key: "payments", label: "Payments" },
  ];
  return (
    <div className="flex items-center justify-around border-t border-border bg-white py-2 px-2 shrink-0">
      {items.map((item) => (
        <div key={item.key} className="flex flex-col items-center gap-1 px-2">
          <div className={cn("w-5 h-5 rounded-md", item.key === active ? "bg-ink" : "bg-black/10")} />
          <span className={cn("text-[9px]", item.key === active ? "text-ink font-medium" : "text-ink/35")}>{item.label}</span>
        </div>
      ))}
    </div>
  );
}
