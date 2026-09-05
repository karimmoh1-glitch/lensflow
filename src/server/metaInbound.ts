import { prisma } from "@/lib/db";
import { ingestInboundMessage } from "@/server/leadIngestion";
import { instagramUserProfile } from "@/lib/meta/instagram";
import { reportFailure } from "@/lib/observe";

/**
 * Meta webhook payloads → Daythread conversations. Both Instagram (object "instagram") and
 * WhatsApp (object "whatsapp_business_account") arrive here. Routing is by the provider
 * account id in the payload, matched to the Integration row that owns it — never by
 * anything the sender controls. Each message is idempotent on the provider's message id.
 */
export type MetaEnvelope = { object: string; entry: Array<Record<string, unknown>> };

export async function processMetaEnvelope(env: MetaEnvelope): Promise<{ handled: number; ignored: number }> {
  let handled = 0;
  let ignored = 0;
  if (env.object === "instagram") {
    for (const entry of env.entry ?? []) {
      const igAccountId = String(entry.id ?? "");
      const integration = await prisma.integration.findFirst({ where: { provider: "INSTAGRAM", externalId: igAccountId, status: { in: ["CONNECTED", "SYNC_ERROR"] } } });
      if (!integration) { ignored++; continue; }
      const messaging = (entry.messaging as Array<Record<string, unknown>> | undefined) ?? [];
      for (const m of messaging) {
        const sender = (m.sender as { id?: string } | undefined)?.id;
        const recipient = (m.recipient as { id?: string } | undefined)?.id;
        const message = m.message as { mid?: string; text?: string; is_echo?: boolean; attachments?: Array<{ type?: string }> } | undefined;
        if (!sender || !message?.mid) { ignored++; continue; }
        // Echoes are our own sends coming back; the recipient must be the connected account.
        if (message.is_echo || recipient !== igAccountId) { ignored++; continue; }
        const text = message.text ?? (message.attachments?.length ? `[${message.attachments.map((a) => a.type ?? "attachment").join(", ")}]` : "");
        if (!text) { ignored++; continue; }
        const profile = integration.accessToken ? await instagramUserProfile(integration.accessToken, sender) : {};
        const name = profile.name || (profile.username ? `@${profile.username}` : `Instagram user ${sender.slice(-4)}`);
        await ingestInboundMessage({ businessId: integration.businessId, channel: "INSTAGRAM", senderName: name, senderHandle: sender, body: text, providerMessageId: message.mid });
        handled++;
      }
    }
    return { handled, ignored };
  }
  if (env.object === "whatsapp_business_account") {
    for (const entry of env.entry ?? []) {
      const changes = (entry.changes as Array<{ field?: string; value?: Record<string, unknown> }> | undefined) ?? [];
      for (const change of changes) {
        if (change.field !== "messages" || !change.value) { ignored++; continue; }
        const v = change.value;
        const phoneNumberId = (v.metadata as { phone_number_id?: string } | undefined)?.phone_number_id;
        if (!phoneNumberId) { ignored++; continue; }
        const integration = await prisma.integration.findFirst({ where: { provider: "WHATSAPP", externalId: phoneNumberId, status: { in: ["CONNECTED", "SYNC_ERROR"] } } });
        if (!integration) { ignored++; continue; }
        const contacts = (v.contacts as Array<{ wa_id?: string; profile?: { name?: string } }> | undefined) ?? [];
        for (const msg of (v.messages as Array<Record<string, unknown>> | undefined) ?? []) {
          const from = String(msg.from ?? "");
          const id = String(msg.id ?? "");
          if (!from || !id) { ignored++; continue; }
          const type = String(msg.type ?? "text");
          const text = type === "text" ? ((msg.text as { body?: string } | undefined)?.body ?? "") : `[${type}]`;
          const name = contacts.find((c) => c.wa_id === from)?.profile?.name ?? `+${from}`;
          await ingestInboundMessage({ businessId: integration.businessId, channel: "WHATSAPP", senderName: name, senderHandle: `+${from}`, clientPhone: `+${from}`, body: text, providerMessageId: id });
          handled++;
        }
        for (const st of (v.statuses as Array<{ id?: string; status?: string; timestamp?: string; errors?: Array<{ code?: number; title?: string }> }> | undefined) ?? []) {
          if (!st.id || !st.status) continue;
          const message = await prisma.message.findFirst({ where: { providerMessageId: st.id, conversation: { businessId: integration.businessId } } });
          if (!message) continue;
          const when = st.timestamp ? new Date(Number(st.timestamp) * 1000) : new Date();
          if (st.status === "delivered") await prisma.message.update({ where: { id: message.id }, data: { status: "DELIVERED", deliveredAt: when, statusDetail: "delivered" } });
          else if (st.status === "read") await prisma.message.update({ where: { id: message.id }, data: { status: "DELIVERED", readAt: when, deliveredAt: message.deliveredAt ?? when, statusDetail: "read" } });
          else if (st.status === "failed") {
            const e = st.errors?.[0];
            await prisma.message.update({ where: { id: message.id }, data: { status: "FAILED", statusDetail: e ? `${e.code ?? ""} ${e.title ?? "failed"}`.trim() : "failed" } });
            await reportFailure("delivery", "WhatsApp delivery failed", { businessId: integration.businessId, provider: "WHATSAPP", meta: { code: e?.code ?? null } });
          } else if (st.status === "sent") await prisma.message.update({ where: { id: message.id }, data: { statusDetail: "sent" } });
          handled++;
        }
      }
    }
  }
  return { handled, ignored };
}
