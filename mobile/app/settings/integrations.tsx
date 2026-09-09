import { Linking, RefreshControl, ScrollView, Text, View } from "react-native";
import { useAuth } from "../../lib/auth-context";
import { useResource } from "../../lib/cache";
import { Badge, Button, Card, ErrorState, Header, Note, Screen, Skeleton } from "../../components/ui";
import { spacing, type, useTheme } from "../../lib/theme";
import { ago } from "../../lib/format";

type Data = { planName: string; quota: { active: number; limit: number | null; atLimit: boolean; overQuota: boolean }; integrations: Array<{ provider: string; name: string; kind: string; status: string; display: { label: string; tone?: string; detail?: string } | string; account: string | null; lastSyncedAt: string | null; configured: boolean }> };
const WEB = process.env.EXPO_PUBLIC_API_URL ?? "https://daythread.org";

/** Real connection state from the record. Connecting needs a browser sign-in with the provider, so it opens the web. */
export default function IntegrationsScreen() {
  const { session } = useAuth();
  const { c } = useTheme();
  const r = useResource<Data>("integrations", "/api/mobile/integrations", session?.token);
  const d = r.data;
  const label = (x: Data["integrations"][number]) => (typeof x.display === "string" ? x.display : x.display?.label ?? x.status.replaceAll("_", " ").toLowerCase());
  const tone = (s: string) => (s === "CONNECTED" ? "success" : s === "NEEDS_ATTENTION" || s === "SYNC_ERROR" ? "warning" : "neutral");
  return (
    <Screen>
      <Header back title="Channels" subtitle={d ? `${d.quota.active} connected${d.quota.limit ? ` of ${d.quota.limit} on ${d.planName}` : ""}` : undefined} />
      {r.loading && !d ? <Skeleton lines={4} /> : !d ? <ErrorState message={r.error ?? "Couldn't load channels."} onRetry={r.reload} /> : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xxl }} refreshControl={<RefreshControl refreshing={r.refreshing} onRefresh={r.refresh} tintColor={c.ink} />}>
          {d.integrations.map((x) => (
            <Card key={x.provider} style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
              <View style={{ flex: 1 }}>
                <Text style={{ ...type.bodyMedium, color: c.ink }}>{x.name}</Text>
                <Text style={{ ...type.small, color: c.inkSoft }} numberOfLines={2}>{x.account ?? (x.configured ? "Not connected" : "Not available on this deployment yet")}{x.lastSyncedAt ? ` · synced ${ago(x.lastSyncedAt)}` : ""}</Text>
              </View>
              <Badge tone={tone(x.status)}>{label(x)}</Badge>
            </Card>
          ))}
          {d.quota.overQuota && <Note tone="warning">More channels are connected than your plan includes. Nothing was removed; new connections wait until one is disconnected or the plan changes.</Note>}
          <Button title="Connect or reconnect on the web" icon="open-outline" onPress={() => Linking.openURL(`${WEB}/dashboard/settings?tab=connections`)} style={{ marginTop: spacing.sm }} />
          <Text style={{ ...type.small, color: c.inkFaint }}>Connecting means signing in with Google or Meta in a browser; Daythread never sees your password.</Text>
        </ScrollView>
      )}
    </Screen>
  );
}
