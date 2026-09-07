import Link from "next/link";
import { prisma } from "@/lib/db";
import { MessageSquare } from "lucide-react";

/** The thread this booking came from — or the person's latest one — so booking → conversation
 * is always one click, the same way conversation → booking is. */
export async function ConversationLink({ bookingId, conversationId, clientId }: { bookingId: string; conversationId: string | null; clientId: string }) {
  const conv = conversationId
    ? await prisma.conversation.findFirst({ where: { id: conversationId }, select: { id: true, channel: true } })
    : await prisma.conversation.findFirst({ where: { clientId, archived: false }, orderBy: { lastMessageAt: "desc" }, select: { id: true, channel: true } });
  if (!conv) return <p className="text-xs text-ink/65">No conversation with this person yet.</p>;
  return (
    <Link href={`/dashboard/inbox?c=${conv.id}`} className="inline-flex items-center gap-2 text-sm font-semibold text-ink hover:text-accent-text transition-colors" data-booking={bookingId}>
      <MessageSquare className="w-4 h-4 text-ink/65" strokeWidth={2} aria-hidden />
      Open the conversation
    </Link>
  );
}
