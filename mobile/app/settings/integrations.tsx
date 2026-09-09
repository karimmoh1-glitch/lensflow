import { useState } from "react";
import { Alert, Linking, RefreshControl, ScrollView, Text, View } from "react-native";
import { useAuth } from "../../lib/auth-context";
import { api, describeError } from "../../lib/api";
import { useResource } from "../../lib/cache";
import { Badge, Button, Card, ErrorState, Field, Header, Note, Screen, Skeleton } from "../../components/ui";
import { spacing, type, useTheme } from "../../lib/theme";
import { ago } from "../../lib/format";

type Row = { provider: string; name: string; kind: string; status: string; display: { label: string } | string; account: string | null; lastSyncedAt: string | null; configured: boolean };
type Data = { planName: string; quota: { active: number; limit: number | null; atLimit: boolean; overQuota: boolean }; integrations: Row[] };
const WEB = process.env.EXPO_PUBLIC_API_URL ?? "https://daythread.org";
const OAUTH = new Set(["EMAIL", "GOOGLE_CALENDAR", "INSTAGRAM", "WHATSAPP"]);

/** Every channel and calendar with its real state. Disconnect, retry, sync now, connect Apple Calendar and pick a text number here; Google and Meta connections need a browser sign-in, which opens the web. */
export default function IntegrationsScreen() {
  const { session } = useAuth();
  const { c } = useTheme();
  const r = useResource<Data>("integrations", "/api/mobile/integrations", session?.token);
  const [busy, setBusy] = useState<string | null>(null);
  const [apple, setApple] = useState<{ appleId: string; password: string } | null>(null);
  const [sms, setSms] = useState<{ areaCode: string; numbers: Array<{ phoneNumber: string; friendlyName: string; locality: string | null; region: string | null }> | null } | null>(null);
  const admin = session?.role === "OWNER" || session?.role === "ADMIN";
  const d = r.data;
  async function act(provider: string, body: Record<string, unknown>, key: string, done?: string) {
    if (!session) return;
    setBusy(key);
    try { const res = await api<{ found?: number; ingested?: number; upserted?: number }>(`/api/mobile/integrations/${provider}`, { method: "POST", body, token: session.token }); await r.reload(); if (done) Alert.alert(done, res.ingested !== undefined ? `${res.ingested} new message${res.ingested === 1 ? "" : "s"}.` : res.upserted !== undefined ? `${res.upserted} events updated.` : undefined); }
    catch (e) { Alert.alert("That didn't work", describeError(e)); }
    finally { setBusy(null); }
  }
  const label = (x: Row) => (typeof x.display === "string" ? x.display : x.display?.label ?? x.status.replaceAll("_", " ").toLowerCase());
  const tone = (s: string) => (s === "CONNECTED" ? "success" : s === "NEEDS_ATTENTION" || s === "SYNC_ERROR" ? "warning" : "neutral");
  return (
    <Screen>
      <Header back title="Channels" subtitle={d ? `${d.quota.active} connected${d.quota.limit ? ` of ${d.quota.limit} on ${d.planName}` : ""}` : undefined} />
      {r.loading && !d ? <Skeleton lines={4} /> : !d ? <ErrorState message={r.error ?? "Couldn't load channels."} onRetry={r.reload} /> : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xxl }} refreshControl={<RefreshControl refreshing={r.refreshing} onRefresh={r.refresh} tintColor={c.ink} />} keyboardShouldPersistTaps="handled">
          {d.integrations.map((x) => {
            const connected = x.status !== "NOT_CONNECTED";
            return (
              <Card key={x.provider}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ ...type.bodyMedium, color: c.ink }}>{x.name}</Text>
                    <Text style={{ ...type.small, color: c.inkSoft }} numberOfLines={2}>{x.account ?? (x.configured ? "Not connected" : "Not available on this deployment yet")}{x.lastSyncedAt ? ` · synced ${ago(x.lastSyncedAt)}` : ""}</Text>
                  </View>
                  <Badge tone={tone(x.status)}>{label(x)}</Badge>
                </View>
                {admin && (
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                    {!connected && OAUTH.has(x.provider) && x.configured && <Button small variant="secondary" icon="open-outline" title="Connect on the web" onPress={() => Linking.openURL(`${WEB}/dashboard/settings?tab=connections`)} />}
                    {!connected && x.provider === "APPLE_CALENDAR" && x.configured && <Button small variant="secondary" title="Connect Apple Calendar" onPress={() => setApple({ appleId: "", password: "" })} />}
                    {!connected && x.provider === "SMS" && x.configured && <Button small variant="secondary" title="Choose a text number" onPress={() => setSms({ areaCode: "", numbers: null })} />}
                    {connected && (x.provider === "EMAIL" || x.kind === "calendar") && <Button small variant="secondary" title="Sync now" loading={busy === `sync:${x.provider}`} onPress={() => act(x.provider, { action: "sync" }, `sync:${x.provider}`, "Synced")} />}
                    {(x.status === "SYNC_ERROR" || x.status === "NEEDS_ATTENTION") && <Button small variant="secondary" title={OAUTH.has(x.provider) && x.status === "NEEDS_ATTENTION" ? "Reconnect on the web" : "Retry"} loading={busy === `retry:${x.provider}`} onPress={() => (OAUTH.has(x.provider) && x.status === "NEEDS_ATTENTION" ? Linking.openURL(`${WEB}/dashboard/settings?tab=connections`) : act(x.provider, { action: "retry" }, `retry:${x.provider}`, "Retried"))} />}
                    {connected && <Button small variant="ghost" title="Disconnect" loading={busy === `dc:${x.provider}`} onPress={() => Alert.alert(`Disconnect ${x.name}?`, x.provider === "SMS" ? "The number is released; texts to it stop arriving." : "Messages already in Daythread stay. Nothing new arrives until it's reconnected.", [{ text: "Cancel", style: "cancel" }, { text: "Disconnect", style: "destructive", onPress: () => (x.provider === "SMS" ? api("/api/mobile/sms", { method: "DELETE", token: session!.token }).then(() => r.reload()).catch((e) => Alert.alert("Couldn't release it", describeError(e))) : act(x.provider, { action: "disconnect" }, `dc:${x.provider}`)) }])} />}
                  </View>
                )}
              </Card>
            );
          })}
          {apple && (
            <Card tone="accent">
              <Text style={{ ...type.micro, color: c.accentText, textTransform: "uppercase", marginBottom: 6 }}>Apple Calendar</Text>
              <Text style={{ ...type.small, color: c.inkSoft, marginBottom: 8, lineHeight: 18 }}>Create an app-specific password at appleid.apple.com (Sign-In and Security → App-Specific Passwords). Your Apple ID password itself is never used.</Text>
              <Field label="Apple ID" value={apple.appleId} onChangeText={(v) => setApple({ ...apple, appleId: v })} autoCapitalize="none" keyboardType="email-address" />
              <Field label="App-specific password" value={apple.password} onChangeText={(v) => setApple({ ...apple, password: v })} autoCapitalize="none" secureTextEntry placeholder="xxxx-xxxx-xxxx-xxxx" />
              <View style={{ flexDirection: "row", gap: 8 }}><Button title="Connect" loading={busy === "apple"} disabled={!/\S+@\S+/.test(apple.appleId) || apple.password.replace(/-/g, "").length < 16} onPress={async () => { await act("APPLE_CALENDAR", { action: "connect_apple", appleId: apple.appleId.trim(), appSpecificPassword: apple.password.trim() }, "apple", "Connected"); setApple(null); }} style={{ flex: 1 }} /><Button title="Cancel" variant="secondary" onPress={() => setApple(null)} /></View>
            </Card>
          )}
          {sms && (
            <Card tone="accent">
              <Text style={{ ...type.micro, color: c.accentText, textTransform: "uppercase", marginBottom: 6 }}>Text number</Text>
              <Field label="Area code (optional)" value={sms.areaCode} onChangeText={(v) => setSms({ ...sms, areaCode: v.replace(/\D/g, "").slice(0, 3) })} keyboardType="number-pad" />
              <Button small variant="secondary" title="Find numbers" loading={busy === "sms:search"} onPress={async () => { if (!session) return; setBusy("sms:search"); try { const res = await api<{ numbers: NonNullable<typeof sms.numbers> }>(`/api/mobile/sms${sms.areaCode ? `?areaCode=${sms.areaCode}` : ""}`, { token: session.token }); setSms({ ...sms, numbers: res.numbers }); } catch (e) { Alert.alert("Couldn't search", describeError(e)); } finally { setBusy(null); } }} />
              {sms.numbers && (sms.numbers.length === 0 ? <Text style={{ ...type.small, color: c.inkSoft, marginTop: 8 }}>No numbers there right now. Try another area code.</Text> : sms.numbers.map((n) => <Button key={n.phoneNumber} small variant="secondary" title={`${n.friendlyName}${n.locality ? ` · ${n.locality}` : ""}`} style={{ marginTop: 6, alignSelf: "flex-start" }} loading={busy === `claim:${n.phoneNumber}`} onPress={async () => { if (!session) return; setBusy(`claim:${n.phoneNumber}`); try { await api("/api/mobile/sms", { method: "POST", body: { phoneNumber: n.phoneNumber }, token: session.token }); setSms(null); await r.reload(); } catch (e) { Alert.alert("Couldn't claim it", describeError(e)); } finally { setBusy(null); } }} />))}
              <Button small variant="ghost" title="Cancel" style={{ marginTop: 8 }} onPress={() => setSms(null)} />
            </Card>
          )}
          {d.quota.overQuota && <Note tone="warning">More channels are connected than your plan includes. Nothing was removed; new connections wait until one is disconnected or the plan changes.</Note>}
          <Text style={{ ...type.small, color: c.inkFaint }}>Gmail, Google Calendar, Instagram and WhatsApp connect by signing in with Google or Meta in a browser, so those open the web. Daythread never sees those passwords.</Text>
        </ScrollView>
      )}
    </Screen>
  );
}
