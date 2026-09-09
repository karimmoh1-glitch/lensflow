import { RefreshControl, ScrollView, Text, View } from "react-native";
import { useAuth } from "../../lib/auth-context";
import { api } from "../../lib/api";
import { useResource } from "../../lib/cache";
import { Button, Card, EmptyState, ErrorState, Header, Screen, Skeleton } from "../../components/ui";
import { spacing, type, useTheme } from "../../lib/theme";
import { ago } from "../../lib/format";

type Data = { unread: number; notifications: Array<{ id: string; title: string; body: string; read: boolean; createdAt: string }> };

/** What Daythread noticed for you: a new person, a channel that needs attention, a failed charge. The same rows the product writes at ingestion. */
export default function NotificationsScreen() {
  const { session } = useAuth();
  const { c } = useTheme();
  const r = useResource<Data>("notifications", "/api/mobile/notifications", session?.token);
  async function readAll() { if (!session) return; await api("/api/mobile/notifications", { method: "POST", body: {}, token: session.token }).catch(() => {}); await r.reload(); }
  const d = r.data;
  return (
    <Screen>
      <Header back title="Notifications" subtitle={d ? (d.unread ? `${d.unread} unread` : "All read") : undefined} right={d && d.unread > 0 ? <Button small variant="secondary" title="Mark all read" onPress={readAll} /> : undefined} />
      {r.loading && !d ? <Skeleton lines={4} /> : !d ? <ErrorState message={r.error ?? "Couldn't load notifications."} onRetry={r.reload} /> : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xxl }} refreshControl={<RefreshControl refreshing={r.refreshing} onRefresh={r.refresh} tintColor={c.ink} />}>
          {d.notifications.length === 0 ? <EmptyState icon="notifications-outline" title="Nothing yet" body="When someone new writes to you, or a channel needs attention, it shows up here." /> : d.notifications.map((n) => (
            <Card key={n.id} tone={n.read ? "card" : "signal"}>
              <View style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
                <View accessible={false} style={{ width: 8, height: 8, borderRadius: 4, marginTop: 7, backgroundColor: n.read ? c.border : c.signal }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ ...type.bodyMedium, color: c.ink, fontWeight: n.read ? "500" : "700" }}>{n.title}</Text>
                  <Text style={{ ...type.small, color: c.inkSoft, lineHeight: 18 }}>{n.body}</Text>
                  <Text style={{ ...type.small, color: c.inkFaint, marginTop: 2 }}>{ago(n.createdAt)}</Text>
                </View>
              </View>
            </Card>
          ))}
        </ScrollView>
      )}
    </Screen>
  );
}
