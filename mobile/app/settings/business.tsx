import { useEffect, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Share, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../lib/auth-context";
import { api, describeError } from "../../lib/api";
import { useResource } from "../../lib/cache";
import { Button, Card, ErrorState, Field, Header, Note, Screen, Skeleton } from "../../components/ui";
import { radius, spacing, type, useTheme } from "../../lib/theme";

type Biz = { name: string; handle: string; bio: string; timezone: string; bufferMinutes: number; bookingLeadHours: number; bookingUrl: string; canEdit: boolean };
type Service = { id?: string; name: string; priceCents: number; durationMins: number };
type Window = { weekday: number; startMin: number; endMin: number };
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const hm = (m: number) => `${((Math.floor(m / 60) + 11) % 12) + 1}:${String(m % 60).padStart(2, "0")} ${m >= 720 ? "pm" : "am"}`;

/** What the business is, what it sells, when it works — the same three editors as Settings → Business on the web, plus the booking page link. */
export default function BusinessScreen() {
  const { session } = useAuth();
  const { c } = useTheme();
  const biz = useResource<Biz>("business", "/api/mobile/business", session?.token);
  const svc = useResource<{ services: Service[] }>("services", "/api/mobile/services", session?.token);
  const av = useResource<{ windows: Window[]; timezone: string }>("availability", "/api/mobile/availability", session?.token);
  const [form, setForm] = useState<Biz | null>(null);
  const [services, setServices] = useState<Service[] | null>(null);
  const [windows, setWindows] = useState<Window[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => { if (biz.data && !form) setForm(biz.data); }, [biz.data, form]);
  useEffect(() => { if (svc.data && !services) setServices(svc.data.services); }, [svc.data, services]);
  useEffect(() => { if (av.data && !windows) setWindows(av.data.windows); }, [av.data, windows]);
  async function save(key: string, path: string, body: unknown, after?: () => void) {
    if (!session) return;
    setBusy(key);
    try { await api(path, { method: "PUT", body, token: session.token }); after?.(); Alert.alert("Saved"); }
    catch (e) { Alert.alert("Not saved", describeError(e)); }
    finally { setBusy(null); }
  }
  const canEdit = biz.data?.canEdit ?? false;
  const inputStyle = { minHeight: 44, borderWidth: 1, borderColor: c.borderStrong, borderRadius: radius.md, paddingHorizontal: 10, fontSize: 15, color: c.ink, backgroundColor: c.card } as const;
  return (
    <Screen>
      <Header back title="Business" subtitle={biz.data ? `/book/${biz.data.handle}` : undefined} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {biz.loading && !form ? <Skeleton lines={5} /> : !form ? <ErrorState message={biz.error ?? "Couldn't load your business."} onRetry={biz.reload} /> : (
          <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl }} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
            <Card>
              <Text style={{ ...type.micro, color: c.inkFaint, textTransform: "uppercase", marginBottom: 8 }}>Booking page</Text>
              <Text style={{ ...type.small, color: c.inkSoft }} selectable>{form.bookingUrl}</Text>
              <Button small variant="secondary" icon="share-outline" title="Share link" style={{ marginTop: 8, alignSelf: "flex-start" }} onPress={() => Share.share({ message: form.bookingUrl })} />
            </Card>
            <Card>
              <Text style={{ ...type.micro, color: c.inkFaint, textTransform: "uppercase", marginBottom: 8 }}>Profile</Text>
              <Field label="Business name" value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} editable={canEdit} maxLength={80} />
              <Field label="About" multiline value={form.bio} onChangeText={(v) => setForm({ ...form, bio: v })} editable={canEdit} maxLength={600} placeholder="Shown on your booking page." />
              <Field label="Timezone" value={form.timezone} onChangeText={(v) => setForm({ ...form, timezone: v })} editable={canEdit} autoCapitalize="none" hint="An IANA name, like America/Los_Angeles." />
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                <View style={{ flex: 1 }}><Field label="Buffer between bookings (min)" keyboardType="number-pad" value={String(form.bufferMinutes)} onChangeText={(v) => setForm({ ...form, bufferMinutes: Number(v.replace(/\D/g, "")) || 0 })} editable={canEdit} /></View>
                <View style={{ flex: 1 }}><Field label="Minimum notice (hours)" keyboardType="number-pad" value={String(form.bookingLeadHours)} onChangeText={(v) => setForm({ ...form, bookingLeadHours: Number(v.replace(/\D/g, "")) || 0 })} editable={canEdit} /></View>
              </View>
              {canEdit ? <Button title="Save profile" loading={busy === "profile"} onPress={() => save("profile", "/api/mobile/business", { name: form.name.trim(), bio: form.bio.trim(), timezone: form.timezone.trim(), bufferMinutes: form.bufferMinutes, bookingLeadHours: form.bookingLeadHours }, () => biz.reload())} /> : <Note>Only an owner or admin can change these.</Note>}
            </Card>
            <Card>
              <Text style={{ ...type.micro, color: c.inkFaint, textTransform: "uppercase", marginBottom: 8 }}>Services</Text>
              {(services ?? []).map((s, i) => (
                <View key={s.id ?? `new-${i}`} style={{ gap: 6, marginBottom: 10, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: c.border }}>
                  <Field label={`Service ${i + 1}`} value={s.name} onChangeText={(v) => setServices(services!.map((x, j) => (j === i ? { ...x, name: v } : x)))} editable={canEdit} maxLength={80} />
                  <View style={{ flexDirection: "row", gap: spacing.sm, alignItems: "flex-end" }}>
                    <View style={{ flex: 1 }}><Field label="Price ($)" keyboardType="decimal-pad" value={String(s.priceCents / 100)} onChangeText={(v) => setServices(services!.map((x, j) => (j === i ? { ...x, priceCents: Math.round((Number(v.replace(/[^\d.]/g, "")) || 0) * 100) } : x)))} editable={canEdit} /></View>
                    <View style={{ flex: 1 }}><Field label="Minutes" keyboardType="number-pad" value={String(s.durationMins)} onChangeText={(v) => setServices(services!.map((x, j) => (j === i ? { ...x, durationMins: Number(v.replace(/\D/g, "")) || 0 } : x)))} editable={canEdit} /></View>
                    {canEdit && <Pressable onPress={() => setServices(services!.filter((_, j) => j !== i))} accessibilityRole="button" accessibilityLabel={`Remove ${s.name || "service"}`} style={{ width: 44, height: 48, alignItems: "center", justifyContent: "center", marginBottom: 12 }}><Ionicons name="trash-outline" size={20} color={c.dangerText} /></Pressable>}
                  </View>
                </View>
              ))}
              {canEdit && (
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <Button small variant="secondary" icon="add" title="Add service" onPress={() => setServices([...(services ?? []), { name: "", priceCents: 0, durationMins: 60 }])} />
                  <Button small title="Save services" loading={busy === "services"} disabled={!services || services.some((s) => !s.name.trim() || s.durationMins < 5)} onPress={() => save("services", "/api/mobile/services", { services: services!.map((s) => ({ ...s, name: s.name.trim() })) }, () => svc.reload())} />
                </View>
              )}
              {services && services.length === 0 && <Text style={{ ...type.small, color: c.inkSoft }}>Add what you offer with a price and a length; drafts and the booking page use it.</Text>}
            </Card>
            <Card>
              <Text style={{ ...type.micro, color: c.inkFaint, textTransform: "uppercase", marginBottom: 8 }}>Hours</Text>
              {(windows ?? []).map((w, i) => (
                <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <Pressable disabled={!canEdit} onPress={() => setWindows(windows!.map((x, j) => (j === i ? { ...x, weekday: (x.weekday + 1) % 7 } : x)))} accessibilityRole="button" accessibilityLabel={`Day: ${DAYS[w.weekday]}, tap to change`} style={{ ...inputStyle, width: 60, justifyContent: "center", alignItems: "center" }}><Text style={{ ...type.bodyMedium, color: c.ink }}>{DAYS[w.weekday]}</Text></Pressable>
                  <Pressable disabled={!canEdit} onPress={() => setWindows(windows!.map((x, j) => (j === i ? { ...x, startMin: (x.startMin + 30) % 1440 } : x)))} onLongPress={() => setWindows(windows!.map((x, j) => (j === i ? { ...x, startMin: (x.startMin + 1410) % 1440 } : x)))} accessibilityRole="button" accessibilityLabel={`Starts ${hm(w.startMin)}; tap for 30 minutes later, hold for earlier`} style={{ ...inputStyle, flex: 1, justifyContent: "center" }}><Text style={{ ...type.body, color: c.ink }}>{hm(w.startMin)}</Text></Pressable>
                  <Text style={{ color: c.inkFaint }}>–</Text>
                  <Pressable disabled={!canEdit} onPress={() => setWindows(windows!.map((x, j) => (j === i ? { ...x, endMin: (x.endMin + 30) % 1440 || 1440 } : x)))} onLongPress={() => setWindows(windows!.map((x, j) => (j === i ? { ...x, endMin: (x.endMin + 1410) % 1440 } : x)))} accessibilityRole="button" accessibilityLabel={`Ends ${hm(w.endMin)}; tap for 30 minutes later, hold for earlier`} style={{ ...inputStyle, flex: 1, justifyContent: "center" }}><Text style={{ ...type.body, color: c.ink }}>{hm(w.endMin)}</Text></Pressable>
                  {canEdit && <Pressable onPress={() => setWindows(windows!.filter((_, j) => j !== i))} accessibilityRole="button" accessibilityLabel="Remove hours" style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}><Ionicons name="trash-outline" size={20} color={c.dangerText} /></Pressable>}
                </View>
              ))}
              {canEdit && (
                <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
                  <Button small variant="secondary" icon="add" title="Add hours" onPress={() => setWindows([...(windows ?? []), { weekday: 1, startMin: 540, endMin: 1020 }])} />
                  <Button small title="Save hours" loading={busy === "hours"} disabled={!windows || windows.some((w) => w.endMin <= w.startMin)} onPress={() => save("hours", "/api/mobile/availability", { windows }, () => av.reload())} />
                </View>
              )}
              <Text style={{ ...type.small, color: c.inkFaint, marginTop: 8 }}>Times are in {av.data?.timezone ?? form.timezone}. Tap a time for 30 minutes later; hold for earlier.</Text>
            </Card>
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </Screen>
  );
}
