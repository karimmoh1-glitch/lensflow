import { useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../../lib/auth-context";
import { api, describeError } from "../../lib/api";
import { Header, Screen } from "../../components/ui";
import { radius, spacing, type, useTheme } from "../../lib/theme";

const PROMPTS = ["What should I work on today?", "Who did I quote this week?", "What's my biggest opportunity right now?", "Who is going cold?", "Where are my leads coming from?", "What happened while I was away?"];
type Turn = { role: "you" | "daythread"; text: string };

/** Answers come from the workspace's own records; when the records don't hold the answer, it says so. */
export default function AssistantScreen() {
  const { session } = useAuth();
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const scroll = useRef<ScrollView>(null);
  async function ask(question: string) {
    if (!session || !question.trim() || busy) return;
    setQ(""); setBusy(true);
    setTurns((t) => [...t, { role: "you", text: question }]);
    try {
      const r = await api<{ answer: string }>("/api/mobile/assistant", { method: "POST", body: { question }, token: session.token });
      setTurns((t) => [...t, { role: "daythread", text: r.answer }]);
    } catch (e) { setTurns((t) => [...t, { role: "daythread", text: describeError(e) }]); }
    finally { setBusy(false); setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 100); }
  }
  return (
    <Screen>
      <Header back title="Assistant" subtitle="Answers from your own records" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView ref={scroll} contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, flexGrow: 1 }} keyboardDismissMode="interactive">
          {turns.length === 0 && (
            <View style={{ gap: spacing.sm }}>
              <Text style={{ ...type.body, color: c.inkSoft, lineHeight: 21 }}>Ask about who's waiting, what to do next, what was quoted, what's on the calendar, or where people wrote from. It never invents a number or a name.</Text>
              {PROMPTS.map((p) => <Pressable key={p} onPress={() => ask(p)} accessibilityRole="button" style={({ pressed }) => [{ minHeight: 48, justifyContent: "center", paddingHorizontal: 14, borderRadius: radius.md, backgroundColor: c.card, borderWidth: 1, borderColor: c.border }, pressed && { opacity: 0.7 }]}><Text style={{ ...type.bodyMedium, color: c.accentText }}>{p}</Text></Pressable>)}
            </View>
          )}
          {turns.map((t, i) => (
            <View key={i} accessible accessibilityLabel={`${t.role === "you" ? "You" : "Daythread"}: ${t.text}`} style={{ alignSelf: t.role === "you" ? "flex-end" : "flex-start", maxWidth: "90%", backgroundColor: t.role === "you" ? c.bubbleOut : c.card, borderRadius: radius.lg, borderWidth: t.role === "you" ? 0 : 1, borderColor: c.border, padding: spacing.md }}>
              <Text style={{ ...type.body, color: t.role === "you" ? c.white : c.ink, lineHeight: 21 }} selectable>{t.text}</Text>
            </View>
          ))}
          {busy && <Text style={{ ...type.small, color: c.inkFaint }} accessibilityLiveRegion="polite">Reading your records…</Text>}
        </ScrollView>
        <View style={{ flexDirection: "row", gap: 8, padding: spacing.md, paddingBottom: Math.max(insets.bottom, spacing.md), borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.card }}>
          <TextInput value={q} onChangeText={setQ} placeholder="Ask about your business…" placeholderTextColor={c.inkFaint} accessibilityLabel="Ask the assistant" maxLength={500} returnKeyType="send" onSubmitEditing={() => ask(q)} style={{ flex: 1, minHeight: 44, borderWidth: 1, borderColor: c.borderStrong, borderRadius: radius.lg, paddingHorizontal: 14, fontSize: 16, color: c.ink, backgroundColor: c.paper }} />
          <Pressable onPress={() => ask(q)} disabled={!q.trim() || busy} accessibilityRole="button" accessibilityLabel="Ask" style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: q.trim() ? c.accent : c.border, alignItems: "center", justifyContent: "center" }}><Ionicons name="arrow-up" size={20} color={q.trim() ? c.white : c.inkFaint} /></Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
