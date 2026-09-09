import { useState } from "react";
import { FlatList, RefreshControl, Text, View } from "react-native";
import { router } from "expo-router";
import { format } from "date-fns";
import { useAuth } from "../../lib/auth-context";
import { useResource } from "../../lib/cache";
import { Avatar, Badge, Chip, EmptyState, ErrorState, Header, ListRow, Screen, Skeleton, StaleBanner } from "../../components/ui";
import { spacing, type, useTheme } from "../../lib/theme";

type Row = { id: string; clientName: string; serviceName: string; startAt: string; endAt: string; status: string; location?: string | null };
const LABEL: Record<string, string> = { INQUIRY: "Inquiry", BOOKED: "Not confirmed", CONFIRMED: "Confirmed", QUESTIONNAIRE_COMPLETE: "Questionnaire done", UPCOMING: "Upcoming", COMPLETED: "Completed", FOLLOWED_UP: "Followed up", CANCELED: "Canceled", DEPOSIT_PAID: "Deposit paid", BALANCE_PAID: "Balance paid" };

/** The same three tabs as the web's Bookings page: what's coming, what happened, what was canceled. */
export default function BookingsScreen() {
  const { session } = useAuth();
  const { c } = useTheme();
  const [scope, setScope] = useState<"upcoming" | "past" | "canceled">("upcoming");
  const r = useResource<{ bookings: Row[] }>(`bookings:${scope}`, `/api/mobile/bookings?scope=${scope}`, session?.token);
  const rows = r.data?.bookings ?? [];
  let lastGroup = "";
  return (
    <Screen>
      <Header back title="Bookings" subtitle={r.data ? `${rows.length} ${scope}` : undefined} />
      <View style={{ flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm }}>
        {(["upcoming", "past", "canceled"] as const).map((s) => <Chip key={s} label={s[0].toUpperCase() + s.slice(1)} active={scope === s} onPress={() => setScope(s)} />)}
      </View>
      {r.stale && <StaleBanner at={r.cachedAt} onRetry={r.reload} />}
      {r.loading && !r.data ? <Skeleton lines={5} /> : !r.data ? <ErrorState message={r.error ?? "Couldn't load bookings."} onRetry={r.reload} /> : (
        <FlatList data={rows} keyExtractor={(b) => b.id} contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, flexGrow: 1 }} refreshControl={<RefreshControl refreshing={r.refreshing} onRefresh={r.refresh} tintColor={c.ink} />}
          ListEmptyComponent={<EmptyState icon="calendar-outline" title={scope === "upcoming" ? "Nothing on the books yet" : scope === "past" ? "No past bookings" : "Nothing canceled"} body={scope === "upcoming" ? "Book someone from their thread, or share your booking page under Business settings." : "Bookings you've completed show here with their gallery links."} />}
          renderItem={({ item }) => {
            const group = format(new Date(item.startAt), "MMMM yyyy");
            const showGroup = group !== lastGroup; lastGroup = group;
            return (
              <View>
                {showGroup && <Text accessibilityRole="header" style={{ ...type.micro, color: c.inkFaint, textTransform: "uppercase", marginTop: spacing.md, marginBottom: 4 }}>{group}</Text>}
                <ListRow onPress={() => router.push(`/booking/${item.id}` as never)} accessibilityLabel={`${item.clientName}, ${item.serviceName}, ${format(new Date(item.startAt), "EEEE, MMMM d, h:mm a")}, ${LABEL[item.status] ?? item.status}`}>
                  <Avatar name={item.clientName} size={36} tone="neutral" />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ ...type.bodyMedium, color: c.ink }} numberOfLines={1}>{item.clientName}</Text>
                    <Text style={{ ...type.small, color: c.inkSoft }} numberOfLines={1}>{item.serviceName} · {format(new Date(item.startAt), "EEE, MMM d · h:mm a")}</Text>
                  </View>
                  <Badge tone={item.status === "CONFIRMED" || item.status === "UPCOMING" ? "success" : item.status === "BOOKED" ? "warning" : item.status === "CANCELED" ? "danger" : "neutral"}>{LABEL[item.status] ?? item.status}</Badge>
                </ListRow>
              </View>
            );
          }}
        />
      )}
    </Screen>
  );
}
