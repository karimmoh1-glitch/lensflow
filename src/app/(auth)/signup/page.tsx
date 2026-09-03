import Link from "next/link";
import { Card, CardBody } from "@/components/ui";

export default function SignupChooserPage() {
  return (
    <main className="min-h-screen bg-paper flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-2xl">
        <Link href="/" className="font-display text-lg block text-center mb-2">
          Daythread
        </Link>
        <h1 className="font-display text-2xl text-center mb-1">Welcome to Daythread</h1>
        <p className="text-sm text-ink/70 text-center mb-8">What are you here to do?</p>

        <div className="grid sm:grid-cols-2 gap-4">
          <Link href="/signup/create" className="block">
            <Card className="h-full transition-shadow hover:shadow-md">
              <CardBody className="p-6">
                <h2 className="font-display text-lg mb-1.5">Create a business</h2>
                <p className="text-sm text-ink/70">
                  I&apos;m a freelancer or independent business and want to manage my clients, bookings, and payments.
                </p>
              </CardBody>
            </Card>
          </Link>
          <Link href="/signup/join" className="block">
            <Card className="h-full transition-shadow hover:shadow-md">
              <CardBody className="p-6">
                <h2 className="font-display text-lg mb-1.5">Join a business</h2>
                <p className="text-sm text-ink/70">I&apos;m working with an existing Daythread business and want to connect with them.</p>
              </CardBody>
            </Card>
          </Link>
        </div>

        <p className="mt-8 text-sm text-center text-ink/70">
          Already have an account?{" "}
          <Link href="/login" className="text-accent-text font-medium">
            Log in
          </Link>
        </p>
      </div>
    </main>
  );
}
