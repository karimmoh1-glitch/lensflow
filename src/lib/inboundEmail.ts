/**
 * Which workspace a received mail belongs to, decided by the recipient on *our* inbound
 * domain and never by whichever address happens to be first.
 *
 * `to` is the message's full recipient list and anyone can put anything in it. Taking
 * `to[0]` meant a mail addressed to "victim-handle@gmail.com" with our own inbound address
 * second was ingested into the victim's workspace as a real enquiry, with the sender, the
 * subject and the body all attacker-chosen. It also misrouted ordinary mail whenever the
 * business's address was not listed first.
 *
 * Without a configured inbound domain no recipient can be trusted to name a workspace, so
 * nothing is routed at all.
 */
export function recipientHandle(to: unknown, inboundDomain: string | undefined): string | null {
  const domain = (inboundDomain ?? "").trim().toLowerCase().replace(/^@/, "");
  if (!domain) return null;
  const recipients = Array.isArray(to) ? to : typeof to === "string" ? [to] : [];
  for (const entry of recipients) {
    // Tolerates "Name <local@domain>" as well as a bare address.
    const raw = String(entry ?? "").trim().toLowerCase();
    const address = raw.includes("<") ? raw.slice(raw.lastIndexOf("<") + 1, raw.lastIndexOf(">")) : raw;
    const at = address.lastIndexOf("@");
    if (at === -1) continue;
    if (address.slice(at + 1) !== domain) continue;
    const local = address.slice(0, at).trim();
    if (local) return local;
  }
  return null;
}
