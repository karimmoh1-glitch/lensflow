import { Card, CardBody, Button, Badge } from "@/components/ui";
import { completeCardCheckout } from "@/app/actions/bookings";
import { redirect } from "next/navigation";

export default async function DemoPaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ amount?: string; description?: string; success?: string; paymentId?: string }>;
}) {
  const { amount, description, success, paymentId } = await searchParams;
  const amountCents = Number(amount ?? 0);

  async function pay() {
    "use server";
    if (paymentId) await completeCardCheckout(paymentId);
    redirect(success || "/dashboard");
  }

  return (
    <main className="min-h-screen bg-paper flex items-center justify-center px-6">
      <Card className="w-full max-w-sm">
        <CardBody className="p-8 text-center">
          <Badge tone="info" className="mb-4">
            Simulated checkout
          </Badge>
          <div className="font-display text-3xl mb-1">${(amountCents / 100).toFixed(2)}</div>
          <p className="text-sm text-ink/50 mb-6">{description}</p>
          <p className="text-xs text-ink/40 mb-6">
            No Stripe key is configured for this workspace, so this is a simulated checkout — no real card is charged.
          </p>
          <form action={pay}>
            <Button type="submit" className="w-full">
              Pay now (simulated)
            </Button>
          </form>
        </CardBody>
      </Card>
    </main>
  );
}
