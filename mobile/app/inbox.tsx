import { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../lib/auth-context";
import { api } from "../lib/api";
import { Badge, Screen } from "../components/ui";
import { colors, spacing } from "../lib/theme";
import { formatDistanceToNow } from "date-fns";

type Lead = {
  id: string;
  clientName: string;
  channel: string | null;
  preview: string | null;
  serviceName: string | null;
  status: string;
  intent: string;
  score: number;
  lastInboundAt: string | null;
};

const CHANNEL_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  INSTAGRAM: "logo-instagram",
  EMAIL: "mail-outline",
  SMS: "chatbubble-outline",
  WHATSAPP: "logo-whatsapp",
  WEBSITE: "globe-outline",
  PHONE: "call-outline",
};

export default function InboxScreen() {
  const { session } = useAuth();
  const [leads, setLeads] = useState<Lead[] | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    const result = await api<{ leads: Lead[] }>("/api/mobile/leads", { token: session.token });
    setLeads(result.leads);
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <Screen>
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.xxl, paddingBottom: spacing.md, flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={colors.ink} />
        </Pressable>
        <Text style={{ fontSize: 22, fontWeight: "700", color: colors.ink }}>Inbox</Text>
      </View>

      {!leads ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={colors.ink} />
        </View>
      ) : (
        <FlatList
          data={leads}
          keyExtractor={(l) => l.id}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push(`/lead/${item.id}`)}
              style={({ pressed }) => [
                {
                  paddingVertical: spacing.md,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.border,
                  flexDirection: "row",
                  gap: spacing.md,
                  alignItems: "flex-start",
                },
                pressed && { opacity: 0.6 },
              ]}
            >
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  backgroundColor: colors.accentSoft,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name={CHANNEL_ICON[item.channel ?? ""] ?? "person-outline"} size={18} color={colors.accentText} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={{ fontSize: 15, fontWeight: "600", color: colors.ink }}>{item.clientName}</Text>
                  {item.status === "NEW" && <Badge tone="accent">New</Badge>}
                </View>
                {item.preview ? (
                  <Text numberOfLines={1} style={{ fontSize: 13, color: colors.inkSoft, marginTop: 2 }}>
                    {item.preview}
                  </Text>
                ) : null}
                <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: 4 }}>
                  {item.serviceName ? <Text style={{ fontSize: 12, color: colors.inkFaint }}>{item.serviceName}</Text> : null}
                  {item.lastInboundAt ? (
                    <Text style={{ fontSize: 12, color: colors.inkFaint }}>
                      {formatDistanceToNow(new Date(item.lastInboundAt), { addSuffix: true })}
                    </Text>
                  ) : null}
                </View>
              </View>
            </Pressable>
          )}
          ListEmptyComponent={
            <Text style={{ color: colors.inkSoft, textAlign: "center", marginTop: spacing.xxl }}>No active leads right now.</Text>
          }
        />
      )}
    </Screen>
  );
}
