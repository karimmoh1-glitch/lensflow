import { useState } from "react";
import { Alert, RefreshControl, ScrollView, Switch, Text, View } from "react-native";
import { useAuth } from "../../lib/auth-context";
import { api, describeError } from "../../lib/api";
import { useResource } from "../../lib/cache";
import { Card, EmptyState, ErrorState, Header, Note, Screen, Skeleton, StaleBanner } from "../../components/ui";
import { spacing, type, useTheme } from "../../lib/theme";
import { ago } from "../../lib/format";

type Data = { entitled: boolean; limit: number | null; automations: Array<{ id: string; name: string; trigger: string; action: string; offsetHours: number; enabled: boolean }>; recent: Array<{ id: string; name: string; result: string; ranAt: string }> };
const TRIGGER: Record<string, string> = { BOOKING_CREATED: "when a booking is made", DAYS_BEFORE_SHOOT: "before a session", SHOOT_COMPLETED: "after a session", LEAD_INACTIVE: "when a lead goes quiet" };

/** Turn automations on and off; creating and editing them happens on the web, where the message editor lives. */
export default function AutomationsScreen() {
  const { session } = useAuth();
  const { c } = useTheme();
  const r = useResource<Data>("automations", "/api/mobile/automations", session?.token);
  const [busy, setBusy] = useState<string | null>(null);
  async function toggle(id: string, enabled: boolean) {
    if (!session) return;
    setBusy(id);
    r.setData((d) => (d ? { ...d, automations: d.automations.map((a) => (a.id === id ? { ...a, enabled } : a)) } : d));
    try { await api(`/api/mobile/automations/${id}`, { method: "POST", body: { enabled }, token: session.token }); }
    catch (e) { r.setData((d) => (d ? { ...d, automations: d.automations.map((a) => (a.id === id ? { ...a, enabled: !enabled } : a)) } : d)); Alert.alert("Couldn't change that", describeError(e)); }
    finally { setBusy(null); }
  }
  const d = r.data;
  const on = d?.automations.filter((a) => a.enabled).length ?? 0;
  return (
    <Screen>
      <Header back title="Automations" subtitle={d ? `${on} running${d.limit ? ` · up to ${d.limit} on your plan` : ""}` : undefined} />
      {r.stale && <StaleBanner at={r.cachedAt} onRetry={r.reload} />}
      {r.loading && !d ? <Skeleton lines={4} /> : !d ? <ErrorState message={r.error ?? "Couldn't load automations."} onRetry={r.reload} /> : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.sm }} refreshControl={<RefreshControl refreshing={r.refreshing} onRefresh={r.refresh} tintColor={c.ink} />}>
          {d.automations.length === 0 ? <EmptyState icon="flash-outline" title="Nothing running yet" body="Create an automation on the web and Daythread sends confirmations, reminders and follow-ups for you. Every send lands in the thread." /> : d.automations.map((a) => (
            <Card key={a.id} style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
              <View style={{ flex: 1 }}>
                <Text style={{ ...type.bodyMedium, color: c.ink }}>{a.name}</Text>
                <Text style={{ ...type.small, color: c.inkSoft }}>{a.action.replaceAll("_", " ").toLowerCase()} {TRIGGER[a.trigger] ?? a.trigger.toLowerCase()}{a.offsetHours ? ` · ${Math.round(a.offsetHours / 24)} days` : ""}</Text>
              </View>
              <Switch value={a.enabled} disabled={busy === a.id} onValueChange={(v) => toggle(a.id, v)} accessibilityLabel={`${a.name}, ${a.enabled ? "on" : "off"}`} trackColor={{ true: c.success, false: c.border }} />
            </Card>
          ))}
          {!d.entitled && d.automations.length > 0 && <Note tone="warning">Turning one on beyond your plan's allowance is refused with the reason. Plans change under Subscription.</Note>}
          {d.recent.length > 0 && (
            <>
              <Text accessibilityRole="header" style={{ ...type.micro, color: c.inkFaint, textTransform: "uppercase", marginTop: spacing.lg }}>Recent</Text>
              {d.recent.map((x) => <Text key={x.id} style={{ ...type.small, color: c.inkSoft }}>{x.name} · {x.result.replaceAll("_", " ")} · {ago(x.ranAt)}</Text>)}
            </>
          )}
        </ScrollView>
      )}
    </Screen>
  );
}
