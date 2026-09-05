"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { useToast } from "@/components/Toaster";
import { startUpgradeCheckout, openBillingPortal } from "@/app/actions/billing";
import type { PlanKey } from "@/lib/billing";

/**
 * Plan buttons. Every state is explicit: pending while Stripe builds the session,
 * "Redirecting" once we have a URL, a toast on any failure. Nothing here changes the
 * plan — Stripe's webhook does; the button only asks.
 */
export function PlanButton({ planKey, label, variant = "primary" }: { planKey: Extract<PlanKey, "PRO" | "BUSINESS">; label: string; variant?: "primary" | "outline" }) {
  const [pending, startTransition] = useTransition();
  const [redirecting, setRedirecting] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  function handleClick() {
    startTransition(async () => {
      const result = await startUpgradeCheckout(planKey);
      if (result.url) {
        setRedirecting(true);
        window.location.href = result.url;
        return;
      }
      if (result.changed) {
        toast({ tone: "outcome", title: "Plan change accepted", body: "Stripe is applying it now — your billing updates within seconds." });
        router.refresh();
        return;
      }
      toast({ tone: "signal", title: "Couldn't change your plan", body: result.error ?? "Something went wrong." });
    });
  }

  return (
    <Button className="w-full" variant={variant} disabled={pending || redirecting} loading={pending || redirecting} loadingLabel={redirecting ? "Taking you to Stripe" : "One moment"} onClick={handleClick}>
      {label}
    </Button>
  );
}

export function ManageBillingButton({ flow, label = "Manage billing", variant = "outline", size = "sm" }: { flow?: "payment_method"; label?: string; variant?: "primary" | "outline" | "secondary"; size?: "sm" | "md" }) {
  const [pending, startTransition] = useTransition();
  const { toast } = useToast();

  function handleClick() {
    startTransition(async () => {
      const result = await openBillingPortal(flow);
      if (result.url) {
        window.location.href = result.url;
        return;
      }
      toast({ tone: "signal", title: "Couldn't open billing", body: result.error ?? "Something went wrong." });
    });
  }

  return (
    <Button variant={variant} size={size} disabled={pending} loading={pending} loadingLabel="Opening Stripe" onClick={handleClick}>
      {label}
    </Button>
  );
}

/**
 * Back from Checkout. The URL says success; the database says what's true. We show a quiet
 * "confirming" state and refresh until the webhook has landed the plan (or give up after
 * 40s and say so) — never granting anything from the query string.
 */
export function CheckoutReturn({ outcome, expectedPlan, currentPlan }: { outcome: "success" | "canceled"; expectedPlan: string | null; currentPlan: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const landed = expectedPlan ? currentPlan.toLowerCase() === expectedPlan : true;
  const [waitedTooLong, setWaitedTooLong] = useState(false);
  const started = useRef(Date.now());
  const announced = useRef(false);

  useEffect(() => {
    if (outcome === "canceled") {
      if (!announced.current) {
        announced.current = true;
        toast({ tone: "neutral", title: "Checkout canceled", body: "Nothing was charged. Your plan is unchanged." });
        router.replace("/dashboard/billing");
      }
      return;
    }
    if (landed) {
      if (!announced.current) {
        announced.current = true;
        toast({ tone: "outcome", title: `You're on ${expectedPlan ? expectedPlan.charAt(0).toUpperCase() + expectedPlan.slice(1) : "your new plan"}`, body: "Payment received. Everything on your plan is unlocked." });
        router.replace("/dashboard/billing");
      }
      return;
    }
    const t = setInterval(() => {
      if (Date.now() - started.current > 40_000) {
        setWaitedTooLong(true);
        clearInterval(t);
        return;
      }
      router.refresh();
    }, 2500);
    return () => clearInterval(t);
  }, [outcome, landed, expectedPlan, router, toast]);

  if (outcome !== "success" || landed) return null;
  return (
    <div role="status" className="mb-6 rounded-2xl border border-signal/25 bg-signal-soft/40 px-4 py-3 text-sm text-ink/80 flex items-center gap-3">
      <span className="w-2 h-2 rounded-full bg-signal animate-pulse" />
      {waitedTooLong ? (
        <span>Payment received by Stripe, but the confirmation hasn&rsquo;t reached us yet. It usually takes seconds; if this page doesn&rsquo;t update in a minute, reload or open Manage billing.</span>
      ) : (
        <span>Confirming your payment with Stripe…</span>
      )}
    </div>
  );
}
