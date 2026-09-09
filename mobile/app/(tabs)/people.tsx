import { useCallback, useMemo, useState } from "react";
import { FlatList, RefreshControl, Text, TextInput, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../../lib/auth-context";
import { useResource } from "../../lib/cache";
import { Avatar, Badge, EmptyState, ErrorState, ListRow, Screen, Skeleton, StaleBanner , useTabFocused } from "../../components/ui";
import { radius, spacing, type, useTheme } from "../../lib/theme";
import { ago } from "../../lib/format";

type Person = { id: string; name: string; email: string | null; phone: string | null; relationship: "LEAD" | "CUSTOMER" | "CONTACT"; label: string; reason: string; lastMessageAt: string | null; channel: string | null; bookings: number };

/** People with evidence of a relationship — a real conversation, a booking, a customer. Never every sender. */
export default function PeopleScreen() {
  const focused = useTabFocused();
  const { session } = useAuth();
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState(""); const [debounced, setDebounced] = useState("");
  useMemo(() => { const t = setTimeout(() => setDebounced(q.trim()), 250); return () => clearTimeout(t); }, [q]);
  const path = `/api/mobile/clients${debounced ? `?q=${encodeURIComponent(debounced)}` : ""}`;
  const r = useResource<{ people: Person[] }>(debounced ? null : "people", path, session?.token);
  useFocusEffect(useCallback(() => { void r.reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [path, session?.token]));
  const customers = r.data?.people.filter((p) => p.relationship === "CUSTOMER").length ?? 0;
  if (!focused) return <Screen />;
  return (
    <Screen>
      <View style={{ paddingTop: insets.top + spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, gap: spacing.sm }}>
        <Text accessibilityRole="header" style={{ ...type.heading, color: c.ink }}>People</Text>
        {r.data && <Text style={{ ...type.small, color: c.inkSoft }}>{customers} {customers === 1 ? "customer" : "customers"} · {r.data.people.length - customers} potential</Text>}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: c.card, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, paddingHorizontal: 12, minHeight: 44 }}>
          <Ionicons name="search-outline" size={18} color={c.inkFaint} />
          <TextInput value={q} onChangeText={setQ} placeholder="Search by name, email or phone" placeholderTextColor={c.inkFaint} accessibilityLabel="Search people" autoCapitalize="none" style={{ flex: 1, fontSize: 16, color: c.ink, minHeight: 44 }} />
        </View>
      </View>
      {r.stale && <StaleBanner at={r.cachedAt} onRetry={r.reload} />}
      {r.loading && !r.data ? <Skeleton lines={6} /> : !r.data ? <ErrorState message={r.error ?? "Couldn't load people."} onRetry={r.reload} /> : (
        <FlatList data={r.data.people} keyExtractor={(p) => p.id} contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, flexGrow: 1 }} refreshControl={<RefreshControl refreshing={r.refreshing} onRefresh={r.refresh} tintColor={c.ink} />} keyboardDismissMode="on-drag"
          ListEmptyComponent={debounced ? <EmptyState icon="search-outline" title="Nobody matches" body={`No one named “${debounced}” yet.`} /> : <EmptyState icon="people-outline" title="Nobody yet" body="Everyone who writes to you on a connected channel shows up here with their conversations and bookings. Automated senders never do." />}
          renderItem={({ item }) => (
            <ListRow onPress={() => router.push(`/person/${item.id}` as never)} accessibilityLabel={`${item.name}, ${item.label}. ${item.reason}`}>
              <Avatar name={item.name} tone={item.relationship === "CUSTOMER" ? "accent" : "neutral"} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ ...type.bodyMedium, color: c.ink }} numberOfLines={1}>{item.name}</Text>
                <Text style={{ ...type.small, color: c.inkSoft }} numberOfLines={2}>{item.reason || item.email || item.phone || ""}</Text>
              </View>
              <View style={{ alignItems: "flex-end", gap: 4 }}>
                <Badge tone={item.relationship === "CUSTOMER" ? "success" : "accent"}>{item.relationship === "CUSTOMER" ? "Customer" : item.relationship === "CONTACT" ? "Contact" : "Potential"}</Badge>
                {item.lastMessageAt && <Text style={{ ...type.small, color: c.inkFaint }}>{ago(item.lastMessageAt).replace(" ago", "")}</Text>}
              </View>
            </ListRow>
          )}
        />
      )}
    </Screen>
  );
}
