import { useCallback, useState } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../../lib/auth-context";
import { api, describeError } from "../../lib/api";
import { useResource } from "../../lib/cache";
import { Avatar, Badge, Button, Card, EmptyState, ErrorState, ListRow, SectionLabel, Screen, Skeleton, StaleBanner , useTabFocused } from "../../components/ui";
import { radius, spacing, type, useTheme } from "../../lib/theme";
import { firstName, money } from "../../lib/format";

type Value = { cents: number; basis: string; known: boolean; label: string };
type Action = { id: string; kind: "reply" | "follow_up" | "confirm_booking"; rule: string; person: { name: string; clientId: string | null; conversationId: string | null; leadId: string | null; bookingId: string | null }; headline: string; why: string; stage: string; detail: string | null; value: Value | null; atRisk: boolean; since: string; draftMode: "reply" | "follow_up" | null };
type Booking = { id: string; when: string; status: string; clientName: string; serviceName: string; location: string | null };
type Today = { generatedAt: string; week: { automatedSent: number; keptOut: number; structuredLeads: number; bookedLeads: number; automationsOn: number; estimatedMinutes: number } | null; unreadNotifications: number; digest: { hoursAway: number; items: Array<{ key: string; count: number; label: string; href: string }>; quotedCents: number; estimatedCents: number; quotedCount: number } | null; next: Action[]; atRisk: { knownCents: number; estimatedCents: number; people: number }; today: Booking[]; upcoming: Booking[] };

function greeting() { const h = new Date().getHours(); return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"; }

export default function TodayScreen() {
  const focused = useTabFocused();
  const { session } = useAuth();
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const r = useResource<Today>("today", "/api/mobile/today", session?.token);
  const [busy, setBusy] = useState<string | null>(null);
  useFocusEffect(useCallback(() => { void r.reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [session?.token]));

  async function act(a: Action, what: "handled" | "tomorrow" | "aside" | "lost") {
    if (!session || !a.person.leadId) return;
    setBusy(a.id);
    try {
      const id = a.person.leadId;
      if (what === "handled") await api(`/api/mobile/leads/${id}/handled`, { method: "POST", token: session.token });
      else if (what === "tomorrow") { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); await api(`/api/mobile/leads/${id}/follow-up`, { method: "POST", body: { at: d.toISOString() }, token: session.token }); }
      else await api(`/api/mobile/leads/${id}/status`, { method: "POST", body: { status: what === "aside" ? "COLD" : "LOST" }, token: session.token });
      r.setData((prev) => (prev ? { ...prev, next: prev.next.filter((x) => x.id !== a.id) } : prev));
    } catch (e) { Alert.alert("That didn't save", describeError(e)); }
    finally { setBusy(null); }
  }
  function more(a: Action) {
    const options = a.kind === "reply" ? [{ text: "Mark handled", onPress: () => act(a, "handled") }] : [{ text: "Follow up tomorrow", onPress: () => act(a, "tomorrow") }, { text: "Set aside", onPress: () => act(a, "aside") }, { text: "Mark lost", style: "destructive" as const, onPress: () => act(a, "lost") }];
    Alert.alert(a.headline, a.why, [...options, { text: "Cancel", style: "cancel" }]);
  }
  const open = (a: Action) => (a.kind === "confirm_booking" && a.person.bookingId ? router.push(`/booking/${a.person.bookingId}` as never) : a.person.conversationId ? router.push({ pathname: "/conversation/[id]", params: { id: a.person.conversationId, draft: a.draftMode ?? "" } } as never) : undefined);
  const d = r.data;
  const [top, ...rest] = d?.next ?? [];
  const risk = d && d.atRisk.people > 0 && (d.atRisk.knownCents > 0 || d.atRisk.estimatedCents > 0) ? `${[d.atRisk.knownCents > 0 ? `${money(d.atRisk.knownCents)} quoted or budgeted` : null, d.atRisk.estimatedCents > 0 ? `about ${money(d.atRisk.estimatedCents)} in service prices` : null].filter(Boolean).join(" and ")} may be going cold across ${d.atRisk.people === 1 ? "1 person" : `${d.atRisk.people} people`}.` : null;

  if (!focused) return <Screen />;
  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + spacing.lg, paddingBottom: spacing.xxl }} refreshControl={<RefreshControl refreshing={r.refreshing} onRefresh={r.refresh} tintColor={c.ink} />}>
        <View style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.lg }}>
          <Text style={{ ...type.micro, color: c.inkFaint, textTransform: "uppercase", marginBottom: 6 }}>{new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
            <Text accessibilityRole="header" style={{ ...type.title, color: c.ink, flex: 1 }}>{greeting()}, {firstName(session?.user.name, "there")}.</Text>
            <Pressable onPress={() => router.push("/settings/search" as never)} accessibilityRole="button" accessibilityLabel="Search" style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}><Ionicons name="search-outline" size={22} color={c.ink} /></Pressable>
            <Pressable onPress={() => router.push("/settings/notifications" as never)} accessibilityRole="button" accessibilityLabel={d?.unreadNotifications ? `Notifications, ${d.unreadNotifications} unread` : "Notifications"} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}><Ionicons name={d?.unreadNotifications ? "notifications" : "notifications-outline"} size={22} color={d?.unreadNotifications ? c.accentText : c.ink} />{d?.unreadNotifications ? <View accessible={false} style={{ position: "absolute", top: 8, right: 8, width: 8, height: 8, borderRadius: 4, backgroundColor: c.accent }} /> : null}</Pressable>
          </View>
        </View>
        {r.stale && <StaleBanner at={r.cachedAt} onRetry={r.reload} />}
        {r.loading && !d ? <Skeleton lines={5} /> : !d ? <ErrorState message={r.error ?? "Couldn't load today."} onRetry={r.reload} /> : (
          <View style={{ paddingHorizontal: spacing.lg }}>
            {d.digest && d.digest.items.length > 0 && (
              <Card tone="signal" style={{ marginBottom: spacing.lg }}>
                <Text style={{ ...type.micro, color: c.signalText, textTransform: "uppercase", marginBottom: 6 }}>While you were away · {d.digest.hoursAway < 48 ? `${Math.round(d.digest.hoursAway)} hours` : `${Math.round(d.digest.hoursAway / 24)} days`}</Text>
                {d.digest.items.map((it) => <Text key={it.key} style={{ ...type.body, color: c.ink, lineHeight: 21 }}>• {it.label}</Text>)}
                {d.digest.quotedCount > 0 && <Text style={{ ...type.small, color: c.inkSoft, marginTop: 6 }}>{d.digest.quotedCents > 0 ? `${money(d.digest.quotedCents)} quoted or budgeted` : ""}{d.digest.quotedCents > 0 && d.digest.estimatedCents > 0 ? " and " : ""}{d.digest.estimatedCents > 0 ? `about ${money(d.digest.estimatedCents)} in service prices` : ""} across {d.digest.quotedCount} open {d.digest.quotedCount === 1 ? "inquiry" : "inquiries"}. Not a forecast.</Text>}
              </Card>
            )}
            <SectionLabel right={risk ? <Text style={{ ...type.small, color: c.inkSoft, flexShrink: 1, textAlign: "right", maxWidth: "70%" }}>Money at risk: {risk}</Text> : null}>Now</SectionLabel>
            {!top ? (
              <Card tone="success"><Text style={{ ...type.body, color: c.ink }}>You're caught up. Nobody is waiting, nothing is going cold, every upcoming booking is confirmed.</Text></Card>
            ) : (
              <Card tone="accent" style={{ borderColor: c.accent }}>
                <View style={{ flexDirection: "row", gap: spacing.md, alignItems: "flex-start" }}>
                  <Avatar name={top.person.name} size={44} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text accessibilityRole="header" style={{ ...type.section, color: c.ink }}>{top.headline}</Text>
                    <View style={{ marginTop: 4 }}><Badge tone="neutral">{top.stage}</Badge></View>
                    <Text style={{ ...type.body, color: c.inkSoft, marginTop: 6, lineHeight: 21 }}>{top.why}{top.detail ? ` ${top.detail}.` : ""}</Text>
                    {top.value && <Text style={{ ...type.small, color: c.ink, fontWeight: "600", marginTop: 4 }}>{top.value.label}{top.value.known ? "" : " · estimate"}</Text>}
                  </View>
                </View>
                <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md, flexWrap: "wrap" }}>
                  <Button title={top.kind === "confirm_booking" ? "Open booking" : top.kind === "reply" ? "Draft reply" : "Draft follow-up"} variant="accent" icon="arrow-forward" onPress={() => open(top)} style={{ flex: 1 }} />
                  {top.kind !== "confirm_booking" && <Button title="More" variant="secondary" loading={busy === top.id} onPress={() => more(top)} />}
                </View>
              </Card>
            )}
            {rest.length > 0 && (
              <View style={{ marginTop: spacing.sm }}>
                {rest.map((a) => (
                  <ListRow key={a.id} onPress={() => open(a)} accessibilityLabel={`${a.headline}. ${a.why}`} trailing={a.kind !== "confirm_booking" ? <Pressable onPress={() => more(a)} accessibilityRole="button" accessibilityLabel={`More actions for ${a.person.name}`} hitSlop={8} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}><Ionicons name="ellipsis-horizontal" size={20} color={c.inkFaint} /></Pressable> : undefined}>
                    <Avatar name={a.person.name} size={36} tone="neutral" />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ ...type.bodyMedium, color: c.ink }} numberOfLines={1}>{a.person.name} <Text style={{ color: c.inkSoft, fontWeight: "400" }}>· {a.stage}</Text></Text>
                      <Text style={{ ...type.small, color: c.inkSoft }} numberOfLines={2}>{a.why}{a.value ? ` ${a.value.label}${a.value.known ? "" : " (estimate)"}.` : ""}</Text>
                    </View>
                  </ListRow>
                ))}
              </View>
            )}
            <SectionLabel>Today</SectionLabel>
            {d.today.length === 0 ? <Card><Text style={{ ...type.body, color: c.inkSoft }}>Nothing on the calendar today. Warm leads are the best use of it.</Text></Card> : d.today.map((b) => <BookingRow key={b.id} b={b} />)}
            <SectionLabel right={<Pressable onPress={() => router.push("/bookings" as never)} accessibilityRole="link" style={{ minHeight: 32, justifyContent: "center" }}><Text style={{ ...type.small, color: c.accentText, fontWeight: "600" }}>All bookings →</Text></Pressable>}>Coming up</SectionLabel>
            {d.upcoming.length === 0 ? <Card><Text style={{ ...type.body, color: c.inkSoft }}>No upcoming bookings yet. Confirmed bookings line up here.</Text></Card> : d.upcoming.map((b) => <BookingRow key={b.id} b={b} />)}
            {d.week && (
              <Card tone="signal" style={{ marginTop: spacing.lg }}>
                <Text style={{ ...type.micro, color: c.signalText, textTransform: "uppercase" }}>Daythread handled, last 7 days</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 8 }}>
                  {[["Messages sent for you", d.week.automatedSent], ["Kept out of your way", d.week.keptOut], ["Inquiries structured", d.week.structuredLeads], ["Turned into bookings", d.week.bookedLeads]].map(([k, v]) => (
                    <View key={String(k)} style={{ width: "50%", marginBottom: 8 }}><Text style={{ ...type.heading, color: c.ink }}>{String(v)}</Text><Text style={{ ...type.small, color: c.inkSoft }}>{String(k)}</Text></View>
                  ))}
                </View>
                <Text style={{ ...type.small, color: c.inkFaint }}>≈{d.week.estimatedMinutes < 60 ? `${d.week.estimatedMinutes} min` : `${(d.week.estimatedMinutes / 60).toFixed(1)} h`} of your time · estimate</Text>
              </Card>
            )}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

function BookingRow({ b }: { b: Booking }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={() => router.push(`/booking/${b.id}` as never)} accessibilityRole="button" accessibilityLabel={`${b.clientName}, ${b.serviceName}, ${b.when}, ${b.status.toLowerCase()}`} style={({ pressed }) => [{ backgroundColor: c.card, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, padding: spacing.md, marginBottom: spacing.sm, flexDirection: "row", alignItems: "center", gap: spacing.md }, pressed && { opacity: 0.7 }]}>
      <View style={{ flex: 1 }}>
        <Text style={{ ...type.bodyMedium, color: c.ink }}>{b.clientName}</Text>
        <Text style={{ ...type.small, color: c.inkSoft }}>{b.serviceName} · {b.when}</Text>
      </View>
      <Badge tone={b.status === "CONFIRMED" ? "success" : b.status === "BOOKED" ? "warning" : "neutral"}>{b.status === "BOOKED" ? "Not confirmed" : b.status.replaceAll("_", " ").toLowerCase()}</Badge>
    </Pressable>
  );
}
