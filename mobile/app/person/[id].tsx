import { Alert, Linking, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../lib/auth-context";
import { useResource } from "../../lib/cache";
import { Avatar, Badge, Button, Card, ErrorState, Header, Screen, Skeleton, StaleBanner, EmptyState } from "../../components/ui";
import { spacing, type, useTheme } from "../../lib/theme";
import { ago } from "../../lib/format";

type Person = { id: string; name: string; email: string | null; phone: string | null; instagram: string | null; relationship: string; since: string; standing: { label: string; standing: string; nextAction: { label: string; why: string } | null; theyWaitFor: string | null; youWaitFor: string | null }; nextBooking: { id: string; label: string; confirmed: boolean } | null; conversations: Array<{ id: string; channel: string; lastMessageAt: string }>; timeline: Array<{ when: string; kind: "conversation" | "booking" | "quote" | "note"; title: string; meta: string | null; href: string | null }>; mergeCandidates: Array<{ id: string; name: string; basis: string; why: string }> };

const KIND_ICON: Record<Person["timeline"][number]["kind"], keyof typeof Ionicons.glyphMap> = { conversation: "chatbubble-outline", booking: "calendar-outline", quote: "pricetag-outline", note: "create-outline" };

/** One person, across every channel: where things stand, what to do next, and the timeline that is the source of truth for the relationship. */
export default function PersonScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const { c } = useTheme();
  const r = useResource<Person>(`person:${id}`, `/api/mobile/clients/${id}`, session?.token);
  const p = r.data;
  const latest = p?.conversations[0];
  return (
    <Screen>
      <Header back title={p?.name ?? "Person"} />
      {r.stale && <StaleBanner at={r.cachedAt} onRetry={r.reload} />}
      {r.loading && !p ? <Skeleton lines={6} /> : !p ? <ErrorState message={r.error ?? "Couldn't load this person."} onRetry={r.reload} /> : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }} refreshControl={<RefreshControl refreshing={r.refreshing} onRefresh={r.refresh} tintColor={c.ink} />}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.lg }}>
            <Avatar name={p.name} size={56} tone={p.relationship === "CUSTOMER" ? "accent" : "neutral"} />
            <View style={{ flex: 1 }}>
              <Text accessibilityRole="header" style={{ ...type.heading, color: c.ink }}>{p.name}</Text>
              <View style={{ flexDirection: "row", gap: 6, marginTop: 4 }}><Badge tone={p.relationship === "CUSTOMER" ? "success" : "accent"}>{p.relationship === "CUSTOMER" ? "Customer" : p.relationship === "CONTACT" ? "Contact" : "Potential customer"}</Badge><Text style={{ ...type.small, color: c.inkFaint }}>since {new Date(p.since).toLocaleDateString(undefined, { month: "short", year: "numeric" })}</Text></View>
            </View>
          </View>
          <Card tone="accent">
            <Text style={{ ...type.micro, color: c.accentText, textTransform: "uppercase" }}>Where we stand · {p.standing.label}</Text>
            <Text style={{ ...type.section, color: c.ink, marginTop: 4, lineHeight: 23 }}>{p.standing.standing}</Text>
            {p.standing.theyWaitFor && <Text style={{ ...type.small, color: c.inkSoft, marginTop: 6 }}>They're waiting for <Text style={{ fontWeight: "700", color: c.accentText }}>{p.standing.theyWaitFor}</Text></Text>}
            {p.standing.youWaitFor && <Text style={{ ...type.small, color: c.inkSoft, marginTop: 2 }}>You're waiting for <Text style={{ fontWeight: "700", color: c.ink }}>{p.standing.youWaitFor}</Text></Text>}
            {p.standing.nextAction && (latest || p.nextBooking) && <Button title={p.standing.nextAction.label} variant="accent" icon="arrow-forward" style={{ marginTop: spacing.md, alignSelf: "flex-start" }} onPress={() => (p.standing.nextAction!.label.startsWith("Confirm") && p.nextBooking ? router.push(`/booking/${p.nextBooking.id}` as never) : latest ? router.push(`/conversation/${latest.id}` as never) : undefined)} />}
          </Card>
          <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md, flexWrap: "wrap" }}>
            {latest && <Button small variant="secondary" icon="chatbubble-outline" title="Open thread" onPress={() => router.push(`/conversation/${latest.id}` as never)} />}
            {p.phone && <Button small variant="secondary" icon="call-outline" title="Call" onPress={() => Linking.openURL(`tel:${p.phone}`)} />}
            {p.email && <Button small variant="secondary" icon="mail-outline" title="Email" onPress={() => Linking.openURL(`mailto:${p.email}`)} />}
          </View>
          {p.mergeCandidates.length > 0 && (
            <Card style={{ marginTop: spacing.lg, borderColor: c.warning }}>
              <Text style={{ ...type.micro, color: c.warningText, textTransform: "uppercase" }}>Might be the same person</Text>
              {p.mergeCandidates.map((m) => <Text key={m.id} style={{ ...type.small, color: c.inkSoft, marginTop: 4 }}>{m.name} — {m.why}</Text>)}
              <Text style={{ ...type.small, color: c.inkFaint, marginTop: 6 }}>Merge or dismiss this from the person's page on the web, where the full records sit side by side.</Text>
            </Card>
          )}
          {p.nextBooking && <Pressable onPress={() => router.push(`/booking/${p.nextBooking!.id}` as never)} accessibilityRole="button" accessibilityLabel={`Upcoming: ${p.nextBooking.label}`}><Card tone="success" style={{ marginTop: spacing.lg }}><Text style={{ ...type.micro, color: c.successText, textTransform: "uppercase" }}>Upcoming</Text><Text style={{ ...type.bodyMedium, color: c.ink, marginTop: 4 }}>{p.nextBooking.label}{p.nextBooking.confirmed ? "" : " · not confirmed"}</Text></Card></Pressable>}
          <Text accessibilityRole="header" style={{ ...type.micro, color: c.inkFaint, textTransform: "uppercase", marginTop: spacing.xl, marginBottom: spacing.sm }}>Timeline</Text>
          {p.timeline.length === 0 ? <EmptyState icon="time-outline" title="Nothing on the thread yet" body="Every conversation, quote, booking and note with this person builds up here, in order." /> : p.timeline.map((e, i) => (
            <Pressable key={i} disabled={!e.href} onPress={() => e.href && router.push(e.href as never)} accessibilityRole={e.href ? "button" : "text"} accessibilityLabel={`${new Date(e.when).toLocaleDateString(undefined, { month: "short", day: "numeric" })}: ${e.title}${e.meta ? `, ${e.meta}` : ""}`} style={{ flexDirection: "row", gap: spacing.md, paddingVertical: spacing.sm, minHeight: 48 }}>
              <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: e.kind === "quote" ? c.accentSoft : e.kind === "booking" ? c.successSoft : c.border, alignItems: "center", justifyContent: "center", marginTop: 2 }}><Ionicons name={KIND_ICON[e.kind]} size={14} color={e.kind === "quote" ? c.accentText : e.kind === "booking" ? c.successText : c.inkSoft} /></View>
              <View style={{ flex: 1 }}>
                <Text style={{ ...type.bodyMedium, color: c.ink }} numberOfLines={2}>{e.title}</Text>
                {e.meta && <Text style={{ ...type.small, color: c.inkSoft }} numberOfLines={2}>{e.meta}</Text>}
              </View>
              <Text style={{ ...type.small, color: c.inkFaint }}>{new Date(e.when).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</Text>
            </Pressable>
          ))}
          <Text style={{ ...type.small, color: c.inkFaint, marginTop: spacing.lg }}>Last activity {latest ? ago(latest.lastMessageAt) : "—"}. Notes are added on the web.</Text>
          {p.relationship !== "CUSTOMER" && <Text style={{ ...type.small, color: c.inkFaint, marginTop: 4 }} onPress={() => Alert.alert("Becoming a customer", "A person becomes a customer when a booking is made. Book them from their thread.")}>How does someone become a customer?</Text>}
        </ScrollView>
      )}
    </Screen>
  );
}
