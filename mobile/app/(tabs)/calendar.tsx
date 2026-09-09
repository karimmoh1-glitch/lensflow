import { useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { addDays, format, isSameDay } from "date-fns";
import { useAuth } from "../../lib/auth-context";
import { useResource } from "../../lib/cache";
import { Badge, Card, EmptyState, ErrorState, Screen, Skeleton, StaleBanner , useTabFocused } from "../../components/ui";
import { radius, spacing, type, useTheme } from "../../lib/theme";

type Item = { kind: "booking" | "busy"; id: string; startAt: string; endAt: string; title: string; subtitle: string; status?: string; location?: string | null; allDay?: boolean };
type Agenda = { items: Item[]; free: Array<{ startAt: string; endAt: string }>; working: Array<{ startAt: string; endAt: string }>; blocked: boolean; calendars: Array<{ provider: string; status: string; lastSyncedAt: string | null }> };

/** A day at a time: bookings, busy time from connected calendars, and what's open — in the business's timezone. */
export default function CalendarScreen() {
  const focused = useTabFocused();
  const { session } = useAuth();
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const [day, setDay] = useState(new Date());
  const days = useMemo(() => Array.from({ length: 14 }, (_, i) => addDays(new Date(), i)), []);
  const key = format(day, "yyyy-MM-dd");
  const r = useResource<Agenda>(`calendar:${key}`, `/api/mobile/calendar?date=${key}`, session?.token);
  const items = (r.data?.items ?? []) as Item[];
  if (!focused) return <Screen />;
  return (
    <Screen>
      <View style={{ paddingTop: insets.top + spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text accessibilityRole="header" style={{ ...type.heading, color: c.ink }}>Calendar</Text>
          <Pressable onPress={() => router.push("/bookings" as never)} accessibilityRole="link" style={{ minHeight: 44, justifyContent: "center" }}><Text style={{ ...type.small, color: c.accentText, fontWeight: "600" }}>All bookings →</Text></Pressable>
        </View>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, flexShrink: 0 }} contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: 6, paddingBottom: spacing.sm, alignItems: "flex-start" }} accessibilityRole="tablist">
        {days.map((d) => {
          const on = isSameDay(d, day);
          return (
            <Pressable key={d.toISOString()} onPress={() => setDay(d)} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={format(d, "EEEE, MMMM d")} style={{ width: 52, minHeight: 64, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: on ? c.ink : c.card, borderWidth: 1, borderColor: on ? c.ink : c.border }}>
              <Text style={{ ...type.micro, color: on ? c.paper : c.inkFaint }}>{format(d, "EEE").toUpperCase()}</Text>
              <Text style={{ ...type.section, color: on ? c.paper : c.ink }}>{format(d, "d")}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {r.stale && <StaleBanner at={r.cachedAt} onRetry={r.reload} />}
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }} refreshControl={<RefreshControl refreshing={r.refreshing} onRefresh={r.refresh} tintColor={c.ink} />}>
        <Text style={{ ...type.section, color: c.ink, marginBottom: spacing.sm }}>{format(day, "EEEE, MMMM d")}</Text>
        {r.loading && !r.data ? <Skeleton lines={4} /> : !r.data ? <ErrorState message={r.error ?? "Couldn't load the day."} onRetry={r.reload} /> : items.length === 0 ? (
          <EmptyState icon="calendar-outline" title="Nothing on this day" body="Bookings from your inbox and booking page show here, along with busy time from a connected calendar." />
        ) : items.map((it, i) => (
          <Pressable key={`${it.kind}-${it.id}-${i}`} disabled={it.kind !== "booking"} onPress={() => router.push(`/booking/${it.id}` as never)} accessibilityRole={it.kind === "booking" ? "button" : "text"} accessibilityLabel={`${it.allDay ? "All day" : `${format(new Date(it.startAt), "h:mm a")} to ${format(new Date(it.endAt), "h:mm a")}`}, ${it.title}, ${it.subtitle}`}>
            <Card style={{ marginBottom: spacing.sm, flexDirection: "row", gap: spacing.md, alignItems: "center", opacity: it.kind === "busy" ? 0.75 : 1 }}>
              <View style={{ width: 64 }}>
                <Text style={{ ...type.bodyMedium, color: c.ink }}>{it.allDay ? "All day" : format(new Date(it.startAt), "h:mm a")}</Text>
                {!it.allDay && <Text style={{ ...type.small, color: c.inkFaint }}>{format(new Date(it.endAt), "h:mm a")}</Text>}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ ...type.bodyMedium, color: c.ink }} numberOfLines={1}>{it.title}</Text>
                <Text style={{ ...type.small, color: c.inkSoft }} numberOfLines={1}>{it.subtitle}</Text>
              </View>
              {it.status && <Badge tone={it.status === "CONFIRMED" ? "success" : it.status === "BOOKED" ? "warning" : "neutral"}>{it.status === "BOOKED" ? "Not confirmed" : it.status.toLowerCase()}</Badge>}
              {it.kind === "busy" && <Badge tone="neutral">busy</Badge>}
            </Card>
          </Pressable>
        ))}
      </ScrollView>
    </Screen>
  );
}
