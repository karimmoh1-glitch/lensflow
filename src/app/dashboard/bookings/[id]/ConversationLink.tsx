import Link from "next/link";
import { prisma } from "@/lib/db";
import { MessageSquare } from "lucide-react";

/** The thread this booking came from — or the person's latest one — so booking → conversation
 * is always one click, the same way conversation → booking is. */
export async function ConversationLink({ businessId, bookingId, conversationId, clientId }: { businessId: string; bookingId: string; conversationId: string | null; clientId: string }) {
  // Scoped to the workspace like every other read, even though the ids come from a booking
  // already loaded for it: a row pointing across tenants must never render a link.
  const conv = conversationId
    ? await prisma.conversation.findFirst({ where: { id: conversationId, businessId }, select: { id: true, channel: true } })
    : await prisma.conversation.findFirst({ where: { clientId, businessId, archived: false }, orderBy: { lastMessageAt: "desc" }, select: { id: true, channel: true } });
  if (!conv) return <p className="text-xs text-ink/65">No conversation with this person yet.</p>;
  return (
    <Link href={`/dashboard/inbox?c=${conv.id}`} className="inline-flex items-center gap-2 min-h-[32px] text-sm font-semibold text-ink hover:text-ink/70 transition-colors" data-booking={bookingId}>
      <MessageSquare className="w-4 h-4 text-ink/65" strokeWidth={2} aria-hidden />
      Open the conversation
    </Link>
  );
}
