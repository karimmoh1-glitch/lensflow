import { useState } from "react";
import { Alert, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { useAuth } from "../../lib/auth-context";
import { api, describeError } from "../../lib/api";
import { useResource } from "../../lib/cache";
import { Avatar, Badge, Card, ErrorState, Header, Note, Screen, Skeleton, Button } from "../../components/ui";
import { spacing, type, useTheme } from "../../lib/theme";

type Data = { current: string; workspaces: Array<{ id: string; name: string; role: string }> };

/** Every workspace you belong to — as a partner at several studios, say. Switching issues a token scoped to that workspace. */
export default function WorkspacesScreen() {
  const { session, adoptSession } = useAuth();
  const { c } = useTheme();
  const r = useResource<Data>("workspaces", "/api/mobile/workspaces", session?.token);
  const [busy, setBusy] = useState<string | null>(null);
  async function go(id: string) {
    if (!session) return;
    setBusy(id);
    try { const res = await api<{ token: string; business: { id: string; name: string; onboardingComplete: boolean }; role: "OWNER" | "ADMIN" | "PHOTOGRAPHER" | "PARTNER" | "CLIENT"; user: { id: string; name: string; email: string } }>("/api/mobile/workspaces", { method: "POST", body: { businessId: id }, token: session.token }); await adoptSession(res.token, { user: res.user, business: res.business, role: res.role }); router.replace("/(tabs)/today"); }
    catch (e) { Alert.alert("Couldn't switch", describeError(e)); }
    finally { setBusy(null); }
  }
  const d = r.data;
  return (
    <Screen>
      <Header back title="Workspaces" />
      {r.loading && !d ? <Skeleton lines={3} /> : !d ? <ErrorState message={r.error ?? "Couldn't load workspaces."} onRetry={r.reload} /> : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xxl }}>
          {d.workspaces.map((w) => (
            <Card key={w.id} style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, borderColor: w.id === d.current ? c.accent : c.border }}>
              <Avatar name={w.name} tone={w.id === d.current ? "accent" : "neutral"} />
              <View style={{ flex: 1 }}><Text style={{ ...type.bodyMedium, color: c.ink }}>{w.name}</Text><Badge tone="neutral">{w.role === "OWNER" ? "Owner" : w.role === "PHOTOGRAPHER" ? "Staff" : w.role[0] + w.role.slice(1).toLowerCase()}</Badge></View>
              {w.id === d.current ? <Text style={{ ...type.small, color: c.accentText, fontWeight: "700" }}>Current</Text> : <Button small variant="secondary" title="Open" loading={busy === w.id} onPress={() => go(w.id)} />}
            </Card>
          ))}
          {d.workspaces.length === 1 && <Note>You belong to one workspace. Invitations from other businesses show up here when you accept them.</Note>}
        </ScrollView>
      )}
    </Screen>
  );
}
