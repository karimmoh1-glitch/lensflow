import { useEffect, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useAuth } from "../../lib/auth-context";
import { api, describeError } from "../../lib/api";
import { useResource } from "../../lib/cache";
import { Button, ErrorState, Field, Header, Note, Screen, Skeleton } from "../../components/ui";
import { radius, spacing, type, useTheme } from "../../lib/theme";

type Memory = { tone: "warm" | "professional" | "casual"; about: string; locations: string; booking: string; policies: string; faqs: string };
const TONES: Array<[Memory["tone"], string]> = [["warm", "Warm"], ["professional", "Professional"], ["casual", "Casual"]];

/** The only facts a draft is allowed to know, in the owner's words. Nothing here is generated. */
export default function MemoryScreen() {
  const { session } = useAuth();
  const { c } = useTheme();
  const r = useResource<{ memory: Memory; canEdit: boolean }>("memory", "/api/mobile/memory", session?.token);
  const [m, setM] = useState<Memory | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (r.data && !m) setM(r.data.memory); }, [r.data, m]);
  async function save() {
    if (!session || !m) return;
    setSaving(true);
    try { await api("/api/mobile/memory", { method: "PUT", body: m, token: session.token }); Alert.alert("Saved", "Drafts and the assistant will use these notes from now on."); }
    catch (e) { Alert.alert("Not saved", describeError(e)); }
    finally { setSaving(false); }
  }
  return (
    <Screen>
      <Header back title="Business memory" subtitle="What drafts may say about you" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {r.loading && !m ? <Skeleton lines={5} /> : !m ? <ErrorState message={r.error ?? "Couldn't load your notes."} onRetry={r.reload} /> : (
          <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }} keyboardDismissMode="interactive" keyboardShouldPersistTaps="handled">
            <Note>Drafts and the assistant treat these notes as the only facts they know about your business. Where you leave a gap, they ask rather than invent.</Note>
            <Text style={{ ...type.small, color: c.inkSoft, fontWeight: "600", marginTop: spacing.lg, marginBottom: 6 }}>Tone</Text>
            <View style={{ flexDirection: "row", gap: 8, marginBottom: spacing.md }} accessibilityRole="radiogroup">
              {TONES.map(([k, label]) => <Pressable key={k} onPress={() => setM({ ...m, tone: k })} accessibilityRole="radio" accessibilityState={{ checked: m.tone === k }} style={{ minHeight: 44, paddingHorizontal: 16, borderRadius: radius.full, alignItems: "center", justifyContent: "center", backgroundColor: m.tone === k ? c.ink : c.card, borderWidth: 1, borderColor: m.tone === k ? c.ink : c.borderStrong }}><Text style={{ ...type.bodyMedium, color: m.tone === k ? c.paper : c.ink }}>{label}</Text></Pressable>)}
            </View>
            <Field label="What you do" multiline numberOfLines={3} maxLength={600} value={m.about} onChangeText={(v) => setM({ ...m, about: v })} placeholder="Family and newborn photography in Redmond. Sessions run about an hour." editable={r.data?.canEdit} />
            <Field label="Areas you serve" multiline maxLength={300} value={m.locations} onChangeText={(v) => setM({ ...m, locations: v })} placeholder="Redmond, Bellevue, Seattle east side. Travel beyond 30 miles is quoted." editable={r.data?.canEdit} />
            <Field label="How booking works" multiline maxLength={600} value={m.booking} onChangeText={(v) => setM({ ...m, booking: v })} placeholder="A 50% deposit holds the date. Weekends book 4–6 weeks out." editable={r.data?.canEdit} />
            <Field label="Policies" multiline maxLength={800} value={m.policies} onChangeText={(v) => setM({ ...m, policies: v })} placeholder="48 hours notice to reschedule. Deposits are non-refundable within 7 days." editable={r.data?.canEdit} />
            <Field label="Common questions" multiline numberOfLines={4} maxLength={1500} value={m.faqs} onChangeText={(v) => setM({ ...m, faqs: v })} placeholder="Do you retouch? Yes, light retouching is included…" editable={r.data?.canEdit} />
            {r.data?.canEdit ? <Button title="Save" onPress={save} loading={saving} /> : <Note tone="warning">Only an owner or admin can change these notes.</Note>}
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </Screen>
  );
}
