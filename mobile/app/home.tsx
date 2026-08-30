import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useFocusEffect, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../lib/auth-context";
import { api } from "../lib/api";
import { Badge, Card, Row, Screen } from "../components/ui";
import { colors, spacing } from "../lib/theme";
import { format } from "date-fns";

type HomeData = {
  businessName: string;
  userName: string;
  newLeadsCount: number;
  todaysShoots: { id: string; clientName: string; serviceName: string; startAt: string; location: string | null }[];
  outstandingFormatted: string;
  hotLeadsCount: number;
};

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export default function HomeScreen() {
  const { session, logout } = useAuth();
  const [data, setData] = useState<HomeData | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!session) return;
    const result = await api<HomeData>("/api/mobile/home", { token: session.token });
    setData(result);
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  if (!data) {
    return (
      <Screen style={{ alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.ink} />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingTop: spacing.xxl, paddingBottom: spacing.xxl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.ink} />}
      >
        <Row style={{ marginBottom: spacing.xl }}>
          <View>
            <Text style={{ fontSize: 26, fontWeight: "700", color: colors.ink }}>
              {greeting()}, {data.userName.split(" ")[0]}.
            </Text>
            <Text style={{ fontSize: 14, color: colors.inkSoft, marginTop: 2 }}>{data.businessName}</Text>
          </View>
          <Pressable onPress={logout}>
            <Ionicons name="log-out-outline" size={22} color={colors.inkSoft} />
          </Pressable>
        </Row>

        <Pressable onPress={() => router.push("/inbox")} style={({ pressed }) => [pressed && { opacity: 0.85 }]}>
          <Card style={{ marginBottom: spacing.md, backgroundColor: colors.ink, borderColor: colors.ink }}>
            <Row>
              <View>
                <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, fontWeight: "600", marginBottom: 4 }}>INBOX</Text>
                <Text style={{ color: colors.white, fontSize: 22, fontWeight: "700" }}>
                  {data.newLeadsCount} new lead{data.newLeadsCount === 1 ? "" : "s"}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={22} color="rgba(255,255,255,0.6)" />
            </Row>
          </Card>
        </Pressable>

        <Row style={{ gap: spacing.md, marginBottom: spacing.md }}>
          <Card style={{ flex: 1 }}>
            <Text style={{ fontSize: 12, color: colors.inkFaint, fontWeight: "600", marginBottom: 4 }}>OUTSTANDING</Text>
            <Text style={{ fontSize: 20, fontWeight: "700", color: colors.ink }}>{data.outstandingFormatted}</Text>
          </Card>
          <Card style={{ flex: 1 }}>
            <Text style={{ fontSize: 12, color: colors.inkFaint, fontWeight: "600", marginBottom: 4 }}>HOT LEADS</Text>
            <Text style={{ fontSize: 20, fontWeight: "700", color: colors.ink }}>{data.hotLeadsCount}</Text>
          </Card>
        </Row>

        <Text style={{ fontSize: 13, fontWeight: "700", color: colors.inkFaint, marginTop: spacing.lg, marginBottom: spacing.sm, letterSpacing: 0.4 }}>
          TODAY&apos;S SHOOTS
        </Text>
        {data.todaysShoots.length === 0 ? (
          <Card>
            <Text style={{ color: colors.inkSoft, fontSize: 14 }}>Nothing on the calendar today.</Text>
          </Card>
        ) : (
          data.todaysShoots.map((s) => (
            <Card key={s.id} style={{ marginBottom: spacing.sm }}>
              <Row>
                <View>
                  <Text style={{ fontSize: 15, fontWeight: "600", color: colors.ink }}>{s.clientName}</Text>
                  <Text style={{ fontSize: 13, color: colors.inkSoft, marginTop: 2 }}>{s.serviceName}</Text>
                </View>
                <Badge tone="accent">{format(new Date(s.startAt), "h:mm a")}</Badge>
              </Row>
            </Card>
          ))
        )}
      </ScrollView>
    </Screen>
  );
}
