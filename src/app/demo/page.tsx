import { Card, CardBody, Button } from "@/components/ui";
import { loginAsDemo } from "@/app/actions/auth";

export const metadata = { title: "LensFlow demo" };

export default function DemoPage() {
  return (
    <main className="min-h-screen bg-paper flex items-center justify-center px-6">
      <Card className="w-full max-w-sm">
        <CardBody className="p-8 text-center">
          <span className="font-display text-lg block mb-4">LensFlow</span>
          <h1 className="font-display text-xl mb-2">Live product demo</h1>
          <p className="text-sm text-ink/55 mb-6">
            You'll be signed in as a real photography studio with real bookings, leads, and payments already in progress — not a
            scripted walkthrough.
          </p>
          <form action={loginAsDemo}>
            <Button type="submit" size="lg" className="w-full">
              Enter live demo
            </Button>
          </form>
          <p className="text-xs text-ink/40 mt-4">
            Start in the Inbox to see AI lead extraction, or check Bookings and Payments to see the full lead-to-delivery flow.
          </p>
        </CardBody>
      </Card>
    </main>
  );
}
