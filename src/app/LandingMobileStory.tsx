"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PhoneFrame } from "./PhoneFrame";
import { ScreenInboxNewLead, ScreenBookingCreated, ScreenPaymentConfirmed, ScreenDeliveryNotification } from "./mobile/MobileScreens";
import { useActiveStep, StoryStep, StoryLayout } from "./ScrollStory";

const STEPS = [
  { eyebrow: "01", title: "The message arrives", body: "A new inquiry lands in your inbox the moment it comes in — from any channel." },
  { eyebrow: "02", title: "It becomes a booking", body: "One tap turns a conversation into a confirmed booking." },
  { eyebrow: "03", title: "Payment is tracked", body: "Watch deposits and balances update in real time." },
  { eyebrow: "04", title: "Delivery is automatic", body: "Your client is notified the moment their work is ready." },
];

const SCREENS = [ScreenInboxNewLead, ScreenBookingCreated, ScreenPaymentConfirmed, ScreenDeliveryNotification];

export function LandingMobileStory() {
  const { active, refs } = useActiveStep(STEPS.length);
  const ActiveScreen = SCREENS[active];

  return (
    <div>
      <div className="text-center mb-4">
        <h2 className="font-sans font-black text-2xl md:text-3xl tracking-tight text-ink">Run it from your phone.</h2>
      </div>
      <StoryLayout
        visual={
          <PhoneFrame className="scale-[0.85] md:scale-100">
            <div key={active} className="h-full animate-[fadeUp_0.4s_ease-out]">
              <ActiveScreen />
            </div>
          </PhoneFrame>
        }
      >
        {STEPS.map((s, i) => (
          <StoryStep key={s.title} index={i} refs={refs} eyebrow={s.eyebrow} title={s.title} body={s.body} />
        ))}
      </StoryLayout>
      <div className="text-center mt-10">
        <Link href="/mobile" className="inline-flex items-center gap-1 text-xs font-medium text-ink/60 hover:text-ink/70 transition-colors">
          See the full mobile experience
          <ArrowRight className="w-3 h-3" strokeWidth={2} />
        </Link>
      </div>
    </div>
  );
}
