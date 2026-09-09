import { useState } from "react";
import { Alert, RefreshControl, ScrollView, Share, Switch, Text, View } from "react-native";
import { useAuth } from "../../lib/auth-context";
import { api, describeError } from "../../lib/api";
import { useResource } from "../../lib/cache";
import { Avatar, Badge, Button, Card, Chip, ErrorState, Field, Header, Note, Screen, Skeleton } from "../../components/ui";
import { spacing, type, useTheme } from "../../lib/theme";
import { ago } from "../../lib/format";

type Data = { entitled: boolean; seats: number | null; you: string; canManage: boolean; members: Array<{ id: string; name: string; email: string | null; role: string; status: string; since: string; canViewAllConversations: boolean }>; invitations: Array<{ id: string; email: string; role: string; createdAt: string }>; requests: Array<{ id: string; name: string; email: string; createdAt: string }> };
const ROLE: Record<string, string> = { OWNER: "Owner", ADMIN: "Admin", PHOTOGRAPHER: "Staff", PARTNER: "Partner", CLIENT: "Client" };

/** Who works here, who's been invited, who asked to join — and what a partner is allowed to see. Same actions as Settings → Team on the web. */
export default function TeamScreen() {
  const { session } = useAuth();
  const { c } = useTheme();
  const r = useResource<Data>("team", "/api/mobile/team", session?.token);
  const [invite, setInvite] = useState<{ name: string; email: string; role: "teammate" | "partner" } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const d = r.data;
  async function call(key: string, path: string, body: unknown, method = "POST") {
    if (!session) return null;
    setBusy(key);
    try { const res = await api<{ link?: string }>(path, { method, body, token: session.token }); await r.reload(); return res; }
    catch (e) { Alert.alert("That didn't work", describeError(e)); return null; }
    finally { setBusy(null); }
  }
  async function sendInvite() {
    if (!invite) return;
    const res = await call("invite", "/api/mobile/team/invite", invite);
    if (res?.link) { setInvite(null); Alert.alert("Invitation ready", "Share the link with them.", [{ text: "Share", onPress: () => Share.share({ message: `Join ${session?.business.name} on Daythread: ${res.link}` }) }, { text: "Later" }]); }
  }
  const active = d?.members.filter((m) => m.status === "ACTIVE").length ?? 0;
  return (
    <Screen>
      <Header back title="Team" subtitle={d ? `${active} ${active === 1 ? "person" : "people"}${d.seats ? ` · ${d.seats} seats on your plan` : ""}` : undefined} right={d?.canManage && d.entitled && !invite ? <Button small variant="accent" icon="person-add-outline" title="Invite" onPress={() => setInvite({ name: "", email: "", role: "teammate" })} /> : undefined} />
      {r.loading && !d ? <Skeleton lines={3} /> : !d ? <ErrorState message={r.error ?? "Couldn't load the team."} onRetry={r.reload} /> : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xxl }} refreshControl={<RefreshControl refreshing={r.refreshing} onRefresh={r.refresh} tintColor={c.ink} />} keyboardShouldPersistTaps="handled">
          {invite && (
            <Card tone="accent">
              <Text style={{ ...type.micro, color: c.accentText, textTransform: "uppercase", marginBottom: 8 }}>Invite</Text>
              <View style={{ flexDirection: "row", gap: 6, marginBottom: 10 }}><Chip label="Teammate" active={invite.role === "teammate"} onPress={() => setInvite({ ...invite, role: "teammate" })} /><Chip label="Partner" active={invite.role === "partner"} onPress={() => setInvite({ ...invite, role: "partner" })} /></View>
              <Text style={{ ...type.small, color: c.inkSoft, marginBottom: 8 }}>{invite.role === "teammate" ? "Sees the whole workspace and works the inbox with you." : "Sees only the bookings you assign to them, unless you open the inbox to them below."}</Text>
              <Field label="Name" value={invite.name} onChangeText={(v) => setInvite({ ...invite, name: v })} />
              <Field label="Email" value={invite.email} onChangeText={(v) => setInvite({ ...invite, email: v })} autoCapitalize="none" keyboardType="email-address" />
              <View style={{ flexDirection: "row", gap: 8 }}><Button title="Create invitation" loading={busy === "invite"} disabled={!invite.name.trim() || !/\S+@\S+\.\S+/.test(invite.email)} onPress={sendInvite} style={{ flex: 1 }} /><Button title="Cancel" variant="secondary" onPress={() => setInvite(null)} /></View>
            </Card>
          )}
          {d.members.map((m) => (
            <Card key={m.id} style={{ opacity: m.status === "ACTIVE" ? 1 : 0.6 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
                <Avatar name={m.name} tone="neutral" />
                <View style={{ flex: 1 }}>
                  <Text style={{ ...type.bodyMedium, color: c.ink }}>{m.name}{m.id === d.you ? " (you)" : ""}</Text>
                  {m.email && <Text style={{ ...type.small, color: c.inkSoft }}>{m.email}</Text>}
                </View>
                <Badge tone={m.role === "OWNER" ? "accent" : m.status !== "ACTIVE" ? "warning" : "neutral"}>{m.status !== "ACTIVE" ? "Deactivated" : ROLE[m.role] ?? m.role}</Badge>
              </View>
              {d.canManage && m.role !== "OWNER" && m.id !== d.you && (
                <View style={{ marginTop: 10, gap: 8 }}>
                  {m.role === "PARTNER" && m.status === "ACTIVE" && (
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                      <Text style={{ ...type.small, color: c.inkSoft, flex: 1 }}>Can see every conversation</Text>
                      <Switch value={m.canViewAllConversations} disabled={busy === `pa:${m.id}`} onValueChange={(v) => { void call(`pa:${m.id}`, `/api/mobile/team/members/${m.id}`, { action: "partnerAccess", canViewAll: v }); }} accessibilityLabel={`${m.name} can see every conversation`} trackColor={{ true: c.success, false: c.border }} />
                    </View>
                  )}
                  <Button small variant={m.status === "ACTIVE" ? "ghost" : "secondary"} title={m.status === "ACTIVE" ? "Deactivate" : "Reactivate"} loading={busy === `st:${m.id}`} style={{ alignSelf: "flex-start" }} onPress={() => (m.status === "ACTIVE" ? Alert.alert(`Deactivate ${m.name}?`, "They lose access immediately; their bookings and messages stay.", [{ text: "Cancel", style: "cancel" }, { text: "Deactivate", style: "destructive", onPress: () => call(`st:${m.id}`, `/api/mobile/team/members/${m.id}`, { action: "status", active: false }) }]) : call(`st:${m.id}`, `/api/mobile/team/members/${m.id}`, { action: "status", active: true }))} />
                </View>
              )}
            </Card>
          ))}
          {d.invitations.length > 0 && (<><Text accessibilityRole="header" style={{ ...type.micro, color: c.inkFaint, textTransform: "uppercase", marginTop: spacing.md }}>Invited</Text>{d.invitations.map((i) => (
            <Card key={i.id}><Text style={{ ...type.bodyMedium, color: c.ink }}>{i.email}</Text><Text style={{ ...type.small, color: c.inkSoft }}>{ROLE[i.role] ?? i.role} · invited {ago(i.createdAt)}</Text>
              <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}><Button small variant="secondary" title="Resend link" loading={busy === `re:${i.id}`} onPress={async () => { const res = await call(`re:${i.id}`, `/api/mobile/team/invitations/${i.id}`, { action: "resend" }); if (res?.link) Share.share({ message: `Join ${session?.business.name} on Daythread: ${res.link}` }); }} /><Button small variant="ghost" title="Revoke" loading={busy === `rv:${i.id}`} onPress={() => call(`rv:${i.id}`, `/api/mobile/team/invitations/${i.id}`, { action: "revoke" })} /></View></Card>))}</>)}
          {d.requests.length > 0 && (<><Text accessibilityRole="header" style={{ ...type.micro, color: c.inkFaint, textTransform: "uppercase", marginTop: spacing.md }}>Asked to join</Text>{d.requests.map((q) => (
            <Card key={q.id}><Text style={{ ...type.bodyMedium, color: c.ink }}>{q.name}</Text><Text style={{ ...type.small, color: c.inkSoft }}>{q.email} · {ago(q.createdAt)}</Text>
              <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}><Button small title="Accept as client" loading={busy === `ok:${q.id}`} onPress={() => call(`ok:${q.id}`, "/api/mobile/team/requests", { id: q.id, accept: true })} /><Button small variant="ghost" title="Decline" loading={busy === `no:${q.id}`} onPress={() => call(`no:${q.id}`, "/api/mobile/team/requests", { id: q.id, accept: false })} /></View></Card>))}</>)}
          {!d.entitled && <Note>Team seats are part of Pro. Upgrade under Subscription.</Note>}
        </ScrollView>
      )}
    </Screen>
  );
}
