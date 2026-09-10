import type Stripe from "stripe";
import { prisma } from "@/lib/db";
import { handleStripeEvent } from "@/server/stripeEvents";
import { handleStripeConnectEvent } from "@/server/stripeConnectEvents";
import { processCalendlyWebhook } from "@/server/calendlySync";
import type { CalendlyWebhookPayload } from "@/lib/calendly";

/**
 * The handlers the daily run uses to retry a failed delivery from its stored payload. Each
 * one is the same function the live route calls, so a retry can never do something the
 * original delivery would not have.
 */
export function webhookRetryHandlers(): Record<string, (payload: unknown) => Promise<void>> {
  return {
    stripe: async (payload) => { await handleStripeEvent(payload as Stripe.Event); },
    stripe_connect: async (payload) => { await handleStripeConnectEvent(payload as Stripe.Event); },
    calendly: async (payload) => {
      const p = payload as CalendlyWebhookPayload & { __integrationId?: string };
      const row = p.__integrationId ? await prisma.integration.findUnique({ where: { id: p.__integrationId } }) : null;
      if (!row || row.status === "NOT_CONNECTED") return;
      await processCalendlyWebhook(p, row);
    },
  };
}
