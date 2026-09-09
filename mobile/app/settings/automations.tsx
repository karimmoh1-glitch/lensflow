import { useState } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, Switch, Text, View } from "react-native";
import { useAuth } from "../../lib/auth-context";
import { api, describeError } from "../../lib/api";
import { useResource } from "../../lib/cache";
import { Button, Card, Chip, EmptyState, ErrorState, Field, Header, Note, Screen, Skeleton, StaleBanner } from "../../components/ui";
import { spacing, type, useTheme } from "../../lib/theme";
import { ago } from "../../lib/format";

type Input = { name: string; trigger: string; action: string; offsetHours: number; messageTemplate: string };
type Auto = Input & { id: string; enabled: boolean };
type Data = { entitled: boolean; limit: number | null; automations: Auto[]; recent: Array<{ id: string; name: string; result: string; ranAt: string }>; recipes: Array<{ key: string; label: string; input: Input }>; variables: string[] };
const TRIGGER: Record<string, string> = { BOOKING_CREATED: "when a booking is made", DAYS_BEFORE_SHOOT: "before a session", SHOOT_COMPLETED: "after a session", LEAD_INACTIVE: "when a lead goes quiet" };
const ACTION: Record<string, string> = { SEND_CONFIRMATION: "Send a confirmation", SEND_QUESTIONNAIRE: "Send the questionnaire", SEND_REMINDER: "Send a reminder", SEND_THANK_YOU: "Send a thank-you", SEND_FOLLOW_UP: "Send a follow-up" };

/** The same editor as the web: a recipe to start from, a message with the same five variables, an offset in hours; the plan cap decides whether it starts on. */
export default function AutomationsScreen() {
  const { session } = useAuth();
  const { c } = useTheme();
  const r = useResource<Data>("automations", "/api/mobile/automations", session?.token);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string | null; form: Input } | null>(null);
  const d = r.data;
  async function toggle(id: string, enabled: boolean) {
    if (!session) return;
    setBusy(id);
    r.setData((x) => (x ? { ...x, automations: x.automations.map((a) => (a.id === id ? { ...a, enabled } : a)) } : x));
    try { await api(`/api/mobile/automations/${id}`, { method: "POST", body: { enabled }, token: session.token }); }
    catch (e) { r.setData((x) => (x ? { ...x, automations: x.automations.map((a) => (a.id === id ? { ...a, enabled: !enabled } : a)) } : x)); Alert.alert("Couldn't change that", describeError(e)); }
    finally { setBusy(null); }
  }
  async function save() {
    if (!session || !editing) return;
    setBusy("save");
    try {
      const res = editing.id ? await api<{ paused: string | null }>(`/api/mobile/automations/${editing.id}`, { method: "PUT", body: editing.form, token: session.token }) : await api<{ paused: string | null }>("/api/mobile/automations", { method: "POST", body: editing.form, token: session.token });
      setEditing(null); await r.reload();
      if (res.paused) Alert.alert("Saved, switched off", res.paused);
    } catch (e) { Alert.alert("Not saved", describeError(e)); }
    finally { setBusy(null); }
  }
  function remove(a: Auto) {
    Alert.alert(`Delete “${a.name}”?`, "It stops running. Messages it already sent stay in the threads.", [{ text: "Keep it", style: "cancel" }, { text: "Delete", style: "destructive", onPress: async () => { if (!session) return; try { await api(`/api/mobile/automations/${a.id}`, { method: "DELETE", token: session.token }); await r.reload(); } catch (e) { Alert.alert("Couldn't delete", describeError(e)); } } }]);
  }
  const on = d?.automations.filter((a) => a.enabled).length ?? 0;
  return (
    <Screen>
      <Header back title="Automations" subtitle={d ? `${on} running${d.limit ? ` · up to ${d.limit} on your plan` : ""}` : undefined} right={d && !editing ? <Button small variant="accent" icon="add" title="New" onPress={() => setEditing({ id: null, form: d.recipes[0].input })} /> : undefined} />
      {r.stale && <StaleBanner at={r.cachedAt} onRetry={r.reload} />}
      {r.loading && !d ? <Skeleton lines={4} /> : !d ? <ErrorState message={r.error ?? "Couldn't load automations."} onRetry={r.reload} /> : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.sm }} refreshControl={<RefreshControl refreshing={r.refreshing} onRefresh={r.refresh} tintColor={c.ink} />} keyboardShouldPersistTaps="handled">
          {editing && (
            <Card tone="accent">
              <Text style={{ ...type.micro, color: c.accentText, textTransform: "uppercase", marginBottom: 8 }}>{editing.id ? "Edit automation" : "New automation"}</Text>
              {!editing.id && <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>{d.recipes.map((rc) => <Chip key={rc.key} label={rc.label} active={editing.form.name === rc.input.name} onPress={() => setEditing({ id: null, form: rc.input })} />)}</View>}
              <Field label="Name" value={editing.form.name} onChangeText={(v) => setEditing({ ...editing, form: { ...editing.form, name: v } })} maxLength={60} />
              <Text style={{ ...type.small, color: c.inkSoft, fontWeight: "600", marginBottom: 6 }}>When</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>{Object.entries(TRIGGER).map(([k, label]) => <Chip key={k} label={label} active={editing.form.trigger === k} onPress={() => setEditing({ ...editing, form: { ...editing.form, trigger: k } })} />)}</View>
              <Text style={{ ...type.small, color: c.inkSoft, fontWeight: "600", marginBottom: 6 }}>Do</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>{Object.entries(ACTION).map(([k, label]) => <Chip key={k} label={label} active={editing.form.action === k} onPress={() => setEditing({ ...editing, form: { ...editing.form, action: k } })} />)}</View>
              <Field label={editing.form.trigger === "BOOKING_CREATED" ? "Delay (hours)" : editing.form.trigger === "DAYS_BEFORE_SHOOT" ? "Hours before the session" : editing.form.trigger === "SHOOT_COMPLETED" ? "Hours after the session" : "Hours of silence"} keyboardType="number-pad" value={String(editing.form.offsetHours)} onChangeText={(v) => setEditing({ ...editing, form: { ...editing.form, offsetHours: Math.max(0, Math.min(1440, Number(v.replace(/\D/g, "")) || 0)) } })} />
              <Field label="Message" multiline numberOfLines={4} maxLength={1000} value={editing.form.messageTemplate} onChangeText={(v) => setEditing({ ...editing, form: { ...editing.form, messageTemplate: v } })} hint={`Variables filled in when it sends: ${d.variables.map((v) => `{{${v}}}`).join(" ")}`} />
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Button title={editing.id ? "Save" : "Create"} loading={busy === "save"} onPress={save} style={{ flex: 1 }} />
                <Button title="Cancel" variant="secondary" onPress={() => setEditing(null)} />
              </View>
            </Card>
          )}
          {d.automations.length === 0 && !editing ? <EmptyState icon="flash-outline" title="Nothing running yet" body="Confirmations, reminders and follow-ups sent for you, from a message you write once. Every send lands in the person's thread." action={<Button small title="Create one" onPress={() => setEditing({ id: null, form: d.recipes[0].input })} />} /> : d.automations.map((a) => (
            <Card key={a.id}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ ...type.bodyMedium, color: c.ink }}>{a.name}</Text>
                  <Text style={{ ...type.small, color: c.inkSoft }}>{ACTION[a.action] ?? a.action} {TRIGGER[a.trigger] ?? a.trigger}{a.offsetHours ? ` · ${a.offsetHours >= 24 ? `${Math.round(a.offsetHours / 24)} days` : `${a.offsetHours} h`}` : ""}</Text>
                </View>
                <Switch value={a.enabled} disabled={busy === a.id} onValueChange={(v) => toggle(a.id, v)} accessibilityLabel={`${a.name}, ${a.enabled ? "on" : "off"}`} trackColor={{ true: c.success, false: c.border }} />
              </View>
              <View style={{ flexDirection: "row", gap: 12, marginTop: 8 }}>
                <Pressable onPress={() => setEditing({ id: a.id, form: { name: a.name, trigger: a.trigger, action: a.action, offsetHours: a.offsetHours, messageTemplate: a.messageTemplate } })} accessibilityRole="button" accessibilityLabel={`Edit ${a.name}`} style={{ minHeight: 40, justifyContent: "center" }}><Text style={{ ...type.small, color: c.accentText, fontWeight: "600" }}>Edit</Text></Pressable>
                <Pressable onPress={() => remove(a)} accessibilityRole="button" accessibilityLabel={`Delete ${a.name}`} style={{ minHeight: 40, justifyContent: "center" }}><Text style={{ ...type.small, color: c.dangerText, fontWeight: "600" }}>Delete</Text></Pressable>
              </View>
            </Card>
          ))}
          {!d.entitled && d.automations.length > 0 && <Note tone="warning">Beyond your plan's allowance, turning one on is refused with the reason. Plans change under Subscription.</Note>}
          {d.recent.length > 0 && (<><Text accessibilityRole="header" style={{ ...type.micro, color: c.inkFaint, textTransform: "uppercase", marginTop: spacing.lg }}>Recent</Text>{d.recent.map((x) => <Text key={x.id} style={{ ...type.small, color: c.inkSoft }}>{x.name} · {x.result.replaceAll("_", " ")} · {ago(x.ranAt)}</Text>)}</>)}
        </ScrollView>
      )}
    </Screen>
  );
}
