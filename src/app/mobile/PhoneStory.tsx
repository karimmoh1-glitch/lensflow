"use client";

import { useEffect, useRef, useState } from "react";
import { PhoneFrame } from "../PhoneFrame";
import {
  ScreenInboxNewLead,
  ScreenConversation,
  ScreenBookingCreated,
  ScreenPaymentConfirmed,
  ScreenDeliveryNotification,
} from "./MobileScreens";
import { cn } from "@/lib/utils";

const STEPS = [
  { title: "A customer messages you", body: "A new Instagram DM lands straight in your inbox — no app switching.", Screen: ScreenInboxNewLead },
  { title: "You open the conversation", body: "See the full thread, with an AI-drafted reply ready to send in your voice.", Screen: ScreenConversation },
  { title: "It becomes a booking", body: "One tap turns the conversation into a confirmed booking, deposit and all.", Screen: ScreenBookingCreated },
  { title: "Payment is confirmed", body: "Watch the deposit land in real time — no chasing, no spreadsheets.", Screen: ScreenPaymentConfirmed },
  { title: "Your client gets their files", body: "When the gallery's ready, they're notified automatically.", Screen: ScreenDeliveryNotification },
];

export function PhoneStory() {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const idx = refs.current.findIndex((el) => el === entry.target);
            if (idx !== -1) setActive(idx);
          }
        }
      },
      { rootMargin: "-40% 0px -40% 0px", threshold: 0 }
    );
    refs.current.forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const ActiveScreen = STEPS[active].Screen;

  return (
    <div className="grid md:grid-cols-2 gap-10 md:gap-16 items-start">
      <div className="order-2 md:order-1 flex justify-center sticky top-20 md:top-28 self-start">
        <PhoneFrame>
          <ActiveScreen />
        </PhoneFrame>
      </div>

      <div className="order-1 md:order-2 flex flex-col gap-24 md:gap-40 py-4 md:py-24">
        {STEPS.map((step, i) => (
          <div
            key={step.title}
            ref={(el) => {
              refs.current[i] = el;
            }}
            className={cn("transition-opacity duration-300", active === i ? "opacity-100" : "opacity-40")}
          >
            <div className="text-xs font-medium text-ink/35 mb-2">{String(i + 1).padStart(2, "0")}</div>
            <h3 className="font-display text-2xl text-ink mb-2">{step.title}</h3>
            <p className="text-sm text-ink/55 max-w-xs">{step.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
