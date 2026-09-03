import { Card, CardBody, Button } from "@/components/ui";
import { loginAsDemo } from "@/app/actions/auth";

export const metadata = { title: "Daythread demo" };

export default function DemoPage() {
  return (
    <main className="min-h-screen bg-paper flex items-center justify-center px-6">
      <Card className="w-full max-w-sm">
        <CardBody className="p-8 text-center">
          <span className="font-display text-lg block mb-4">Daythread</span>
          <h1 className="font-display text-xl mb-2">Live product demo</h1>
          <p className="text-sm text-ink/75 mb-6">
            You&apos;ll be signed in as a real independent business with real bookings, leads, and payments already in progress — not a
            scripted walkthrough.
          </p>
          <form action={loginAsDemo}>
            <Button type="submit" size="lg" className="w-full">
              Enter live demo
            </Button>
          </form>
          <p className="text-xs text-ink/60 mt-4">
            Start in the Inbox to see AI lead extraction, or check Bookings and Payments to see the full lead-to-delivery flow.
          </p>
        </CardBody>
      </Card>
    </main>
  );
}
