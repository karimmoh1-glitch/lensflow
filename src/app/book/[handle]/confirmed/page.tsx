import { CheckCircle2 } from "lucide-react";
import { Card, CardBody } from "@/components/ui";

export default async function BookingConfirmedPage() {
  return (
    <main className="min-h-screen bg-paper flex items-center justify-center px-6">
      <Card className="w-full max-w-sm">
        <CardBody className="text-center py-10">
          <CheckCircle2 className="w-9 h-9 text-success mx-auto mb-3" strokeWidth={1.75} />
          <h1 className="font-display text-2xl mb-2">You&apos;re booked</h1>
          <p className="text-sm text-ink/75">Your booking is in. You&apos;ll hear from us soon with anything else you need to know.</p>
        </CardBody>
      </Card>
    </main>
  );
}
