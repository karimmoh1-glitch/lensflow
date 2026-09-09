import { useState } from "react";
import { Alert, Linking, RefreshControl, ScrollView, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { format } from "date-fns";
import { useAuth } from "../../../lib/auth-context";
import { api, describeError } from "../../../lib/api";
import { useResource } from "../../../lib/cache";
import { Badge, Button, Card, ErrorState, Field, Header, Note, Screen, Skeleton, StaleBanner } from "../../../components/ui";
import { spacing, type, useTheme } from "../../../lib/theme";
import { money } from "../../../lib/format";

type Booking = { id: string; status: string; startAt: string; endAt: string; location: string | null; client: { id: string; name: string; email: string | null; phone: string | null }; service: { id: string; name: string }; totalCents: number; conversationId: string | null; deliveryUrl: string | null; deliveryNote: string | null; deliveredAt: string | null };

const LABEL: Record<string, string> = { INQUIRY: "Inquiry", BOOKED: "Booked, not confirmed", DEPOSIT_PAID: "Deposit paid", CONFIRMED: "Confirmed", QUESTIONNAIRE_COMPLETE: "Questionnaire done", UPCOMING: "Upcoming", COMPLETED: "Completed", BALANCE_PAID: "Balance paid", FOLLOWED_UP: "Followed up", CANCELED: "Canceled" };
/** Same legal moves as the server; the server re-checks every one. */
const NEXT: Record<string, Array<{ status: string; label: string }>> = {
  INQUIRY: [{ status: "BOOKED", label: "Mark booked" }],
  BOOKED: [{ status: "CONFIRMED", label: "Confirm" }],
  DEPOSIT_PAID: [{ status: "CONFIRMED", label: "Confirm" }],
  CONFIRMED: [{ status: "UPCOMING", label: "Mark upcoming" }, { status: "COMPLETED", label: "Mark completed" }],
  QUESTIONNAIRE_COMPLETE: [{ status: "UPCOMING", label: "Mark upcoming" }, { status: "COMPLETED", label: "Mark completed" }],
  UPCOMING: [{ status: "COMPLETED", label: "Mark completed" }],
  COMPLETED: [{ status: "FOLLOWED_UP", label: "Mark followed up" }],
  BALANCE_PAID: [{ status: "FOLLOWED_UP", label: "Mark followed up" }],
};

/** One booking: when, who, where things stand, the next honest step, and the gallery hand-off. Confirming here is the same action as on the web. */
export default function BookingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const { c } = useTheme();
  const r = useResource<Booking>(`booking:${id}`, `/api/mobile/bookings/${id}`, session?.token);
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState(""); const [note, setNote] = useState("");
  const b = r.data;
  async function advance(status: string, label: string) {
    if (!session) return;
    const go = async () => { setBusy(true); try { await api(`/api/mobile/bookings/${id}/advance`, { method: "POST", body: { status }, token: session.token }); await r.reload(); } catch (e) { Alert.alert("That didn't save", describeError(e)); } finally { setBusy(false); } };
    if (status === "CANCELED") Alert.alert("Cancel this booking?", "The time opens up again. The person is not messaged automatically.", [{ text: "Keep it", style: "cancel" }, { text: "Cancel booking", style: "destructive", onPress: go }]);
    else if (status === "CONFIRMED") Alert.alert("Confirm?", "Marks the booking confirmed on your calendar. Tell them yourself from the thread, or let the assistant propose it.", [{ text: "Not yet", style: "cancel" }, { text: label, onPress: go }]);
    else void go();
  }
  async function deliver() {
    if (!session || !url.trim()) return;
    setBusy(true);
    try { await api(`/api/mobile/bookings/${id}/deliver`, { method: "POST", body: { url: url.trim(), note: note.trim() || undefined }, token: session.token }); setUrl(""); setNote(""); await r.reload(); }
    catch (e) { Alert.alert("Not saved", describeError(e)); }
    finally { setBusy(false); }
  }
  return (
    <Screen>
      <Header back title={b ? b.client.name : "Booking"} subtitle={b ? b.service.name : undefined} />
      {r.stale && <StaleBanner at={r.cachedAt} onRetry={r.reload} />}
      {r.loading && !b ? <Skeleton lines={5} /> : !b ? <ErrorState message={r.error ?? "Couldn't load this booking."} onRetry={r.reload} /> : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl }} refreshControl={<RefreshControl refreshing={r.refreshing} onRefresh={r.refresh} tintColor={c.ink} />} keyboardShouldPersistTaps="handled">
          <Card>
            <Badge tone={b.status === "CONFIRMED" || b.status === "UPCOMING" ? "success" : b.status === "BOOKED" ? "warning" : b.status === "CANCELED" ? "danger" : "neutral"}>{LABEL[b.status] ?? b.status}</Badge>
            <Text style={{ ...type.heading, color: c.ink, marginTop: 8 }}>{format(new Date(b.startAt), "EEEE, MMMM d")}</Text>
            <Text style={{ ...type.body, color: c.inkSoft }}>{format(new Date(b.startAt), "h:mm a")} – {format(new Date(b.endAt), "h:mm a")}{b.location ? ` · ${b.location}` : ""}</Text>
            {b.totalCents > 0 && <Text style={{ ...type.small, color: c.inkSoft, marginTop: 6 }}>Booked at {money(b.totalCents)}</Text>}
          </Card>
          {b.status === "BOOKED" && <Note tone="warning">Not confirmed yet. A confirmed date is a kept date.</Note>}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
            {(NEXT[b.status] ?? []).map((n) => <Button key={n.status} title={n.label} variant={n.status === "CONFIRMED" ? "accent" : "secondary"} loading={busy} onPress={() => advance(n.status, n.label)} />)}
            {b.status !== "CANCELED" && b.status !== "FOLLOWED_UP" && <Button title="Cancel booking" variant="ghost" onPress={() => advance("CANCELED", "Cancel")} />}
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
            {b.conversationId && <Button small variant="secondary" icon="chatbubble-outline" title="Open thread" onPress={() => router.push(`/conversation/${b.conversationId}` as never)} />}
            <Button small variant="secondary" icon="person-outline" title="Profile" onPress={() => router.push(`/person/${b.client.id}` as never)} />
            {b.client.phone && <Button small variant="secondary" icon="call-outline" title="Call" onPress={() => Linking.openURL(`tel:${b.client.phone}`)} />}
          </View>
          <Card>
            <Text style={{ ...type.micro, color: c.inkFaint, textTransform: "uppercase", marginBottom: 6 }}>Delivery</Text>
            {b.deliveryUrl ? (
              <>
                <Text style={{ ...type.body, color: c.ink }}>Delivered {b.deliveredAt ? format(new Date(b.deliveredAt), "MMM d") : ""}{b.deliveryNote ? ` · ${b.deliveryNote}` : ""}</Text>
                <Button small variant="secondary" icon="open-outline" title="Open gallery link" style={{ marginTop: 8, alignSelf: "flex-start" }} onPress={() => Linking.openURL(b.deliveryUrl!)} />
              </>
            ) : b.status === "COMPLETED" || b.status === "FOLLOWED_UP" || b.status === "BALANCE_PAID" ? (
              <>
                <Field label="Gallery link" value={url} onChangeText={setUrl} placeholder="https://…" autoCapitalize="none" keyboardType="url" />
                <Field label="Note (optional)" value={note} onChangeText={setNote} placeholder="Password, what's included…" />
                <Button title="Mark delivered" onPress={deliver} loading={busy} disabled={!url.trim()} />
              </>
            ) : <Text style={{ ...type.small, color: c.inkSoft }}>Add the gallery link here once the session is completed.</Text>}
          </Card>
          <Text style={{ ...type.small, color: c.inkFaint }}>Rescheduling happens on the web, where free slots are checked against your calendar.</Text>
        </ScrollView>
      )}
    </Screen>
  );
}
