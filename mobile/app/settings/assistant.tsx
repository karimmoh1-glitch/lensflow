import { useRef, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../../lib/auth-context";
import { api, describeError } from "../../lib/api";
import { useResource } from "../../lib/cache";
import { Avatar, Button, Card, Header, Note, Screen } from "../../components/ui";
import { radius, spacing, type, useTheme } from "../../lib/theme";
import { ago, money } from "../../lib/format";

const PROMPTS = ["What should I work on today?", "Who did I quote this week?", "What's my biggest opportunity right now?", "Who is going cold?", "Where are my leads coming from?", "What happened while I was away?"];
type Turn = { role: "you" | "daythread"; text: string };
type Proposal = { id: string; kind: string; title: string; why: string; clientName: string | null; conversationId: string | null; draft: string | null; href: string | null; valueCents: number | null };
type Brief = { plan: string; generatedAt: string; proposals: Proposal[]; activity: Array<{ at: string; kind: string; title: string; result: string }> };

/** The assistant, as on the web: what it would do next — reviewed, edited and approved by you, sent through the real channel — and a place to ask about your own records. */
export default function AssistantScreen() {
  const { session } = useAuth();
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const brief = useResource<Brief>("agent", "/api/mobile/agent", session?.token);
  const [open, setOpen] = useState<{ p: Proposal; draft: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [q, setQ] = useState("");
  const [asking, setAsking] = useState(false);
  const scroll = useRef<ScrollView>(null);
  const entitled = brief.data ? true : brief.error?.includes("Pro") ? false : null;

  async function review(p: Proposal) {
    if (!session) return;
    setBusy(p.id);
    try { const r = await api<{ proposal: Proposal; draft: string | null }>(`/api/mobile/agent/${encodeURIComponent(p.id)}`, { token: session.token }); setOpen({ p: r.proposal, draft: r.draft ?? "" }); }
    catch (e) { Alert.alert("Couldn't prepare that", describeError(e)); }
    finally { setBusy(null); }
  }
  async function decide(p: Proposal, decision: "approve" | "dismiss", body?: string) {
    if (!session) return;
    setBusy(p.id);
    try {
      const r = await api<{ status?: string; note?: string }>(`/api/mobile/agent/${encodeURIComponent(p.id)}`, { method: "POST", body: decision === "approve" ? { decision, body } : { decision }, token: session.token });
      setOpen(null); await brief.reload();
      if (decision === "approve") Alert.alert(r.status === "SENT" ? "Sent" : "Saved, not delivered", r.note ?? "");
    } catch (e) { Alert.alert("That didn't go through", describeError(e)); }
    finally { setBusy(null); }
  }
  async function ask(question: string) {
    if (!session || !question.trim() || asking) return;
    setQ(""); setAsking(true); setTurns((t) => [...t, { role: "you", text: question }]);
    try { const r = await api<{ answer: string }>("/api/mobile/assistant", { method: "POST", body: { question }, token: session.token }); setTurns((t) => [...t, { role: "daythread", text: r.answer }]); }
    catch (e) { setTurns((t) => [...t, { role: "daythread", text: describeError(e) }]); }
    finally { setAsking(false); setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 100); }
  }
  const proposals = brief.data?.proposals ?? [];
  return (
    <Screen>
      <Header back title="Assistant" subtitle={brief.data ? (proposals.length ? `${proposals.length} ready for your approval` : "Nothing to propose right now") : entitled === false ? "Part of Pro" : undefined} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView ref={scroll} contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, flexGrow: 1 }} keyboardDismissMode="interactive" refreshControl={<RefreshControl refreshing={brief.refreshing} onRefresh={brief.refresh} tintColor={c.ink} />}>
          {entitled === false && <Note tone="warning">The assistant reads your inbox and calendar and proposes the day's work for you to approve. It's part of Pro — see Subscription.</Note>}
          {open && (
            <Card tone="accent">
              <Text style={{ ...type.micro, color: c.accentText, textTransform: "uppercase" }}>Review · {open.p.title}</Text>
              <Text style={{ ...type.small, color: c.inkSoft, marginTop: 4 }}>{open.p.why}</Text>
              <TextInput value={open.draft} onChangeText={(v) => setOpen({ ...open, draft: v })} multiline accessibilityLabel="Message to send" style={{ marginTop: 8, minHeight: 100, borderWidth: 1, borderColor: c.borderStrong, borderRadius: radius.md, padding: 12, fontSize: 16, color: c.ink, backgroundColor: c.paper, textAlignVertical: "top" }} />
              <Text style={{ ...type.small, color: c.inkFaint, marginTop: 6 }}>Nothing is sent until you approve. Read it first.</Text>
              <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
                <Button title="Send" variant="accent" icon="send-outline" loading={busy === open.p.id} disabled={!open.draft.trim()} onPress={() => decide(open.p, "approve", open.draft.trim())} style={{ flex: 1 }} />
                <Button title="Not this" variant="secondary" onPress={() => decide(open.p, "dismiss")} />
                <Button title="Close" variant="ghost" onPress={() => setOpen(null)} />
              </View>
            </Card>
          )}
          {proposals.filter((p) => p.kind !== "reconnect_calendar").map((p) => (
            <Card key={p.id}>
              <View style={{ flexDirection: "row", gap: spacing.md, alignItems: "flex-start" }}>
                <Avatar name={p.clientName ?? "Daythread"} size={36} tone="neutral" />
                <View style={{ flex: 1 }}>
                  <Text style={{ ...type.bodyMedium, color: c.ink }}>{p.title}</Text>
                  <Text style={{ ...type.small, color: c.inkSoft, marginTop: 2 }}>{p.why}{p.valueCents ? ` About ${money(p.valueCents)} of work is riding on it.` : ""}</Text>
                </View>
              </View>
              <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
                <Button small variant="accent" title="Review" loading={busy === p.id} onPress={() => review(p)} />
                <Button small variant="secondary" title="Dismiss" onPress={() => decide(p, "dismiss")} />
                {p.conversationId && <Button small variant="ghost" title="Open thread" onPress={() => router.push(`/conversation/${p.conversationId}` as never)} />}
              </View>
            </Card>
          ))}
          {proposals.filter((p) => p.kind === "reconnect_calendar").map((p) => <Note key={p.id} tone="warning">{p.title}. {p.why} Reconnect under Channels.</Note>)}
          {brief.data && brief.data.activity.length > 0 && (
            <View>
              <Text accessibilityRole="header" style={{ ...type.micro, color: c.inkFaint, textTransform: "uppercase", marginTop: spacing.md, marginBottom: 4 }}>Done this week</Text>
              {brief.data.activity.slice(0, 6).map((a, i) => <Text key={i} style={{ ...type.small, color: c.inkSoft }}>{a.title} · {a.result} · {ago(a.at)}</Text>)}
            </View>
          )}
          <Text accessibilityRole="header" style={{ ...type.micro, color: c.inkFaint, textTransform: "uppercase", marginTop: spacing.lg, marginBottom: 4 }}>Ask about your business</Text>
          {turns.length === 0 && (
            <View style={{ gap: spacing.sm }}>
              <Text style={{ ...type.small, color: c.inkSoft, lineHeight: 19 }}>Answers come from your own records. It never invents a number or a name.</Text>
              {PROMPTS.map((p) => <Pressable key={p} onPress={() => ask(p)} accessibilityRole="button" style={({ pressed }) => [{ minHeight: 44, justifyContent: "center", paddingHorizontal: 14, borderRadius: radius.md, backgroundColor: c.card, borderWidth: 1, borderColor: c.border }, pressed && { opacity: 0.7 }]}><Text style={{ ...type.bodyMedium, color: c.accentText }}>{p}</Text></Pressable>)}
            </View>
          )}
          {turns.map((t, i) => (
            <View key={i} accessible accessibilityLabel={`${t.role === "you" ? "You" : "Daythread"}: ${t.text}`} style={{ alignSelf: t.role === "you" ? "flex-end" : "flex-start", maxWidth: "90%", backgroundColor: t.role === "you" ? c.bubbleOut : c.card, borderRadius: radius.lg, borderWidth: t.role === "you" ? 0 : 1, borderColor: c.border, padding: spacing.md }}>
              <Text style={{ ...type.body, color: t.role === "you" ? c.white : c.ink, lineHeight: 21 }} selectable>{t.text}</Text>
            </View>
          ))}
          {asking && <Text style={{ ...type.small, color: c.inkFaint }} accessibilityLiveRegion="polite">Reading your records…</Text>}
        </ScrollView>
        <View style={{ flexDirection: "row", gap: 8, padding: spacing.md, paddingBottom: Math.max(insets.bottom, spacing.md), borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.card }}>
          <TextInput value={q} onChangeText={setQ} placeholder="Ask about your business…" placeholderTextColor={c.inkFaint} accessibilityLabel="Ask the assistant" maxLength={500} returnKeyType="send" onSubmitEditing={() => ask(q)} style={{ flex: 1, minHeight: 44, borderWidth: 1, borderColor: c.borderStrong, borderRadius: radius.lg, paddingHorizontal: 14, fontSize: 16, color: c.ink, backgroundColor: c.paper }} />
          <Pressable onPress={() => ask(q)} disabled={!q.trim() || asking} accessibilityRole="button" accessibilityLabel="Ask" style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: q.trim() ? c.accent : c.border, alignItems: "center", justifyContent: "center" }}><Ionicons name="arrow-up" size={20} color={q.trim() ? c.white : c.inkFaint} /></Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
