import { ChevronLeft, Bell, Check } from "lucide-react";
import { PhoneBottomNav } from "../PhoneFrame";
import { cn } from "@/lib/utils";

export function ScreenInboxNewLead() {
  return (
    <div className="h-full flex flex-col">
      <div className="px-5 pt-2 pb-3 shrink-0">
        <h1 className="font-display text-xl text-ink">Inbox</h1>
      </div>
      <div className="flex-1 overflow-hidden divide-y divide-border">
        <div className="flex items-center gap-3 px-5 py-3.5 bg-accent-soft/40">
          <div className="w-9 h-9 rounded-full bg-accent-soft text-accent-text flex items-center justify-center text-[11px] font-semibold shrink-0">
            SJ
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-medium">Sarah Johnson</span>
              <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
            </div>
            <div className="text-[11px] text-ink/40">Instagram · just now</div>
            <p className="text-xs text-ink/55 truncate mt-0.5">Are you available June 14?</p>
          </div>
        </div>
        {[
          ["Mike Smith", "Email", "Thanks, that sounds great!"],
          ["Jessica Nguyen", "SMS", "Do you have availability next week?"],
        ].map(([name, ch, msg]) => (
          <div key={name} className="flex items-center gap-3 px-5 py-3.5">
            <div className="w-9 h-9 rounded-full bg-black/[0.05] text-ink/50 flex items-center justify-center text-[11px] font-semibold shrink-0">
              {name[0]}
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-sm font-medium">{name}</span>
              <div className="text-[11px] text-ink/40">{ch}</div>
              <p className="text-xs text-ink/45 truncate mt-0.5">{msg}</p>
            </div>
          </div>
        ))}
      </div>
      <PhoneBottomNav active="inbox" />
    </div>
  );
}

export function ScreenConversation() {
  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2.5 px-4 pt-2 pb-3 border-b border-border shrink-0">
        <ChevronLeft className="w-5 h-5 text-ink/50" strokeWidth={2} />
        <div className="w-8 h-8 rounded-full bg-accent-soft text-accent-text flex items-center justify-center text-[11px] font-semibold shrink-0">
          SJ
        </div>
        <div>
          <div className="text-sm font-medium leading-tight">Sarah Johnson</div>
          <div className="text-[10px] text-ink/40 leading-tight">Instagram</div>
        </div>
      </div>
      <div className="flex-1 px-4 py-4 space-y-3 overflow-hidden">
        <div className="max-w-[80%] rounded-2xl rounded-bl-sm bg-black/[0.05] px-3.5 py-2.5 text-xs">Are you available June 14?</div>
        <div className="rounded-lg border border-accent/30 bg-accent-soft/30 px-3 py-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-accent-text mb-1">AI draft</div>
          <p className="text-xs text-ink/70">Hi Sarah! Yes, June 14th is open. A 30% deposit holds your date — want me to send the link?</p>
        </div>
        <div className="flex justify-end">
          <div className="text-[11px] font-medium bg-ink text-white rounded-md px-3 py-1.5">Send</div>
        </div>
      </div>
    </div>
  );
}

export function ScreenBookingCreated() {
  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2.5 px-4 pt-2 pb-3 border-b border-border shrink-0">
        <ChevronLeft className="w-5 h-5 text-ink/50" strokeWidth={2} />
        <div className="text-sm font-medium">Booking</div>
      </div>
      <div className="flex-1 px-5 py-5">
        <div className="text-xs font-semibold uppercase tracking-wide text-info-text bg-info-soft inline-block rounded-full px-2.5 py-1 mb-3">
          Booked
        </div>
        <h2 className="font-display text-lg text-ink mb-0.5">Sarah Johnson</h2>
        <p className="text-xs text-ink/45 mb-5">Graduation Session · June 14, 2:00 PM</p>
        <div className="rounded-lg border border-border p-3.5 space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-ink/50">Total</span>
            <span className="font-medium text-ink">$350</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-ink/50">Deposit due</span>
            <span className="font-medium text-warning-text">$105</span>
          </div>
        </div>
      </div>
      <PhoneBottomNav active="bookings" />
    </div>
  );
}

export function ScreenPaymentConfirmed() {
  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2.5 px-4 pt-2 pb-3 border-b border-border shrink-0">
        <ChevronLeft className="w-5 h-5 text-ink/50" strokeWidth={2} />
        <div className="text-sm font-medium">Payments</div>
      </div>
      <div className="flex-1 px-5 py-5">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-full bg-success-soft text-success flex items-center justify-center shrink-0">
            <Check className="w-5 h-5" strokeWidth={2.25} />
          </div>
          <div>
            <div className="text-sm font-medium text-ink">Deposit received</div>
            <div className="text-xs text-ink/45">Sarah Johnson · just now</div>
          </div>
        </div>
        <div className="rounded-lg border border-border p-3.5 space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-ink/50">Paid</span>
            <span className="font-medium text-success">$105</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-ink/50">Remaining</span>
            <span className="font-medium text-ink">$245</span>
          </div>
        </div>
      </div>
      <PhoneBottomNav active="payments" />
    </div>
  );
}

export function ScreenDeliveryNotification() {
  return (
    <div className="h-full flex flex-col bg-black/[0.02]">
      <div className="px-5 pt-3 shrink-0">
        <div className="text-[11px] text-ink/35 mb-2">Notifications</div>
        <div className="rounded-xl bg-white border border-border shadow-xs p-3.5 flex gap-3">
          <div className="w-8 h-8 rounded-full bg-accent-soft text-accent-text flex items-center justify-center shrink-0">
            <Bell className="w-4 h-4" strokeWidth={2} />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-medium text-ink">Alex Rivera Photography</div>
            <p className="text-xs text-ink/55 mt-0.5">Your gallery is ready! Tap to view your graduation photos.</p>
            <div className="text-[10px] text-ink/35 mt-1">now</div>
          </div>
        </div>
      </div>
      <div className={cn("flex-1 flex items-center justify-center px-8")}>
        <p className="text-center text-xs text-ink/35">Delivered — 24 edited photos ready to download.</p>
      </div>
    </div>
  );
}
