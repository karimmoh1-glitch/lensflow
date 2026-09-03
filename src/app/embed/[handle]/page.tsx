import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { EmbedLeadForm } from "./EmbedLeadForm";

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }): Promise<Metadata> {
  const { handle } = await params;
  const business = await prisma.business.findUnique({ where: { handle }, select: { name: true } });
  if (!business) return {};
  return { title: `Get in touch with ${business.name}` };
}

export default async function EmbedLeadFormPage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const business = await prisma.business.findUnique({
    where: { handle },
    include: { services: { where: { active: true }, orderBy: { sortOrder: "asc" } } },
  });
  if (!business) notFound();

  return (
    <main className="min-h-screen bg-white px-5 py-6">
      <div className="max-w-sm mx-auto">
        <h1 className="font-display text-lg text-ink mb-1">Get in touch with {business.name}</h1>
        <p className="text-xs text-ink/70 mb-5">We&apos;ll get back to you shortly.</p>
        <EmbedLeadForm handle={handle} services={business.services.map((s) => ({ id: s.id, name: s.name }))} />
      </div>
    </main>
  );
}
