import { RefreshControl, ScrollView, Text, View } from "react-native";
import { useAuth } from "../../lib/auth-context";
import { useResource } from "../../lib/cache";
import { Avatar, Badge, Card, ErrorState, Header, Note, Screen, Skeleton } from "../../components/ui";
import { spacing, type, useTheme } from "../../lib/theme";

type Data = { entitled: boolean; seats: number | null; you: string; members: Array<{ id: string; name: string; email: string | null; role: string; since: string }> };
const ROLE: Record<string, string> = { OWNER: "Owner", ADMIN: "Admin", PHOTOGRAPHER: "Staff", PARTNER: "Partner", CLIENT: "Client" };

/** Who works in this workspace. Invitations and roles are managed on the web. */
export default function TeamScreen() {
  const { session } = useAuth();
  const { c } = useTheme();
  const r = useResource<Data>("team", "/api/mobile/team", session?.token);
  const d = r.data;
  return (
    <Screen>
      <Header back title="Team" subtitle={d ? `${d.members.length} ${d.members.length === 1 ? "person" : "people"}${d.seats ? ` · ${d.seats} seats on your plan` : ""}` : undefined} />
      {r.loading && !d ? <Skeleton lines={3} /> : !d ? <ErrorState message={r.error ?? "Couldn't load the team."} onRetry={r.reload} /> : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xxl }} refreshControl={<RefreshControl refreshing={r.refreshing} onRefresh={r.refresh} tintColor={c.ink} />}>
          {d.members.map((m) => (
            <Card key={m.id} style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
              <Avatar name={m.name} tone="neutral" />
              <View style={{ flex: 1 }}>
                <Text style={{ ...type.bodyMedium, color: c.ink }}>{m.name}{m.id === d.you ? " (you)" : ""}</Text>
                {m.email && <Text style={{ ...type.small, color: c.inkSoft }}>{m.email}</Text>}
              </View>
              <Badge tone={m.role === "OWNER" ? "accent" : "neutral"}>{ROLE[m.role] ?? m.role}</Badge>
            </Card>
          ))}
          <View style={{ marginTop: spacing.md }}><Note>{d.entitled ? "Invite people and set what partners can see under Settings → Team on the web." : "Team seats are part of Pro. Upgrade under Subscription."}</Note></View>
        </ScrollView>
      )}
    </Screen>
  );
}
