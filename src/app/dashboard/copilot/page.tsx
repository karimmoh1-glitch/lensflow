import { redirect } from "next/navigation";
import { requireBusiness } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { CopilotChat } from "./CopilotChat";

export default async function CopilotPage() {
  const ctx = await requireBusiness();
  if (!ctx) redirect("/login");

  return (
    <div className="max-w-2xl mx-auto px-4 md:px-8 py-6 md:py-10 flex flex-col h-screen">
      <PageHeader title="Business copilot" description="Ask about leads, payments, and bookings — grounded in your real data." />
      <CopilotChat />
    </div>
  );
}
