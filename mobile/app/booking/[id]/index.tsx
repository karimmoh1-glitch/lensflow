import { useState } from "react";
import { Alert, Linking, RefreshControl, ScrollView, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { format } from "date-fns";
import { useAuth } from "../../../lib/auth-context";
import { api, describeError } from "../../../lib/api";
import { useResource } from "../../../lib/cache";
import { Badge, Button, Card, ErrorState, Field, Header, Note, Screen, Skeleton, StaleBanner } from "../../../components/ui";
import { spacing, type, useTheme } from "../../../lib/theme";
import { SlotPicker } from "../../../components/SlotPicker";
import { useCallback } from "react";
import { money } from "../../../lib/format";

type Booking = { id: string; status: string; startAt: string; endAt: string; location: string | null; client: { id: string; name: string; email: string | null; phone: string | null }; service: { id: string; name: string }; totalCents: number; conversationId: string | null; deliveryUrl: string | null; deliveryNote: string | null; deliveredAt: string | null; assignedMembershipId?: string | null; questionnaireSentAt?: string | null };

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
  const [reschedule, setReschedule] = useState(false);
  const team = useResource<{ canManage: boolean; members: Array<{ id: string; name: string; role: string; status: string }> }>("team", "/api/mobile/team", session?.token);
  const loadSlots = useCallback(async (date: string) => (await api<{ slots: Array<{ start: string; end: string }> }>(`/api/mobile/bookings/${id}/reschedule?date=${date}`, { token: session?.token })).slots, [id, session?.token]);
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
  async function move(startISO: string) {
    if (!session) return;
    setBusy(true);
    try { const r = await api<{ notified: string }>(`/api/mobile/bookings/${id}/reschedule`, { method: "POST", body: { startISO, notify: true }, token: session.token }); setReschedule(false); await r2.reload(); Alert.alert("Moved", r.notified === "sent" ? "They've been told the new time." : r.notified === "not_delivered" ? "Moved. The message couldn't be delivered on this channel, so tell them yourself." : "Moved. Tell them the new time from their thread."); }
    catch (e) { Alert.alert("Couldn't move it", describeError(e)); }
    finally { setBusy(false); }
  }
  async function assign(membershipId: string | null) {
    if (!session) return;
    try { await api(`/api/mobile/bookings/${id}/assign`, { method: "POST", body: { membershipId }, token: session.token }); await r2.reload(); }
    catch (e) { Alert.alert("Couldn't assign", describeError(e)); }
  }
  async function questionnaire() {
    if (!session) return;
    setBusy(true);
    try { await api(`/api/mobile/bookings/${id}/questionnaire`, { method: "POST", token: session.token }); await r2.reload(); Alert.alert("Questionnaire sent", "It went out on their channel and is in the thread."); }
    catch (e) { Alert.alert("Not sent", describeError(e)); }
    finally { setBusy(false); }
  }
  const r2 = r;
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
            {b.status !== "CANCELED" && b.status !== "FOLLOWED_UP" && b.status !== "COMPLETED" && <Button title={reschedule ? "Keep the time" : "Reschedule"} variant="secondary" onPress={() => setReschedule((v) => !v)} />}
            {b.status !== "CANCELED" && b.status !== "FOLLOWED_UP" && <Button title="Cancel booking" variant="ghost" onPress={() => advance("CANCELED", "Cancel")} />}
          </View>
          {reschedule && <Card><Text style={{ ...type.micro, color: c.inkFaint, textTransform: "uppercase", marginBottom: 8 }}>Move to</Text><SlotPicker load={loadSlots} onPick={move} busy={busy} confirmLabel="Move" /></Card>}
          {(b.status === "CONFIRMED" || b.status === "BOOKED" || b.status === "UPCOMING") && !b.questionnaireSentAt && b.conversationId && <Button title="Send questionnaire" variant="secondary" icon="document-text-outline" loading={busy} onPress={questionnaire} />}
          {team.data?.canManage && team.data.members.some((m) => m.role === "PARTNER" && m.status === "ACTIVE") && (
            <Card>
              <Text style={{ ...type.micro, color: c.inkFaint, textTransform: "uppercase", marginBottom: 6 }}>Assigned to</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                <Button small variant={!b.assignedMembershipId ? "primary" : "secondary"} title="Nobody" onPress={() => assign(null)} />
                {team.data.members.filter((m) => m.role === "PARTNER" && m.status === "ACTIVE").map((m) => <Button key={m.id} small variant={b.assignedMembershipId === m.id ? "primary" : "secondary"} title={m.name} onPress={() => assign(m.id)} />)}
              </View>
            </Card>
          )}
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
                <Button small variant="secondary" icon="open-outline" title="Open delivery" style={{ marginTop: 8, alignSelf: "flex-start" }} onPress={() => Linking.openURL(b.deliveryUrl!)} />
              </>
            ) : b.status === "COMPLETED" || b.status === "FOLLOWED_UP" || b.status === "BALANCE_PAID" ? (
              <>
                <Field label="Delivery link" value={url} onChangeText={setUrl} placeholder="https://…" autoCapitalize="none" keyboardType="url" />
                <Field label="Note (optional)" value={note} onChangeText={setNote} placeholder="Password, what is included…" />
                <Button title="Mark delivered" onPress={deliver} loading={busy} disabled={!url.trim()} />
              </>
            ) : <Text style={{ ...type.small, color: c.inkSoft }}>Add the delivery link here once the work is complete.</Text>}
          </Card>
        </ScrollView>
      )}
    </Screen>
  );
}
