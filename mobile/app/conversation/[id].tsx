import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../../lib/auth-context";
import { api, describeError } from "../../lib/api";
import { useResource } from "../../lib/cache";
import { Badge, Button, Card, ErrorState, Header, Note, Screen, Skeleton, StaleBanner } from "../../components/ui";
import { radius, spacing, type, useTheme } from "../../lib/theme";
import { ago, channelLabel } from "../../lib/format";
import { SlotPicker } from "../../components/SlotPicker";

type Msg = { id: string; direction: "INBOUND" | "OUTBOUND"; text: string; hasMore: boolean; original: string; createdAt: string; status: string | null; statusDetail: string | null; aiDrafted: boolean; summary: string | null; summarySource: string | null };
type Thread = { id: string; channel: string; subject: string | null; name: string; isPerson: boolean; waitingOnYou: boolean; client: { id: string; name: string; email: string | null; phone: string | null; relationship: string } | null; lead: { id: string; status: string; followUpAt: string | null; canBook: boolean } | null; relationship: { label: string; standing: string; nextAction: { label: string; why: string } | null } | null; opportunity: { label: string; reason: string; nextAction: { kind: string; label: string } | null }; facts: Array<{ label: string; value: string }>; upcoming: { id: string; label: string; confirmed: boolean } | null; window: { open: boolean; text: string } | null; summary: { summary: string; source: string } | null; messages: Msg[] };

const MODES: Array<[string, string]> = [["reply", "Reply"], ["follow_up", "Follow up"], ["ask_missing", "Ask what's missing"], ["send_pricing", "Send pricing"], ["confirm_booking", "Confirm booking"], ["handle_objection", "Handle a concern"], ["close", "Wrap up"]];

/** The thread: cleaned messages, why it matters, the draft intents, and one send that goes through the real channel. */
export default function ConversationScreen() {
  const { id, draft: draftParam } = useLocalSearchParams<{ id: string; draft?: string }>();
  const { session } = useAuth();
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const r = useResource<Thread>(`thread:${id}`, `/api/mobile/conversations/${id}`, session?.token);
  const [text, setText] = useState("");
  const [drafting, setDrafting] = useState<string | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [aiDrafted, setAiDrafted] = useState(false);
  const [sending, setSending] = useState(false);
  const [showModes, setShowModes] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [summarizing, setSummarizing] = useState<string | null>(null);
  const [booking, setBooking] = useState(false);
  const [bookBusy, setBookBusy] = useState(false);
  const [tools, setTools] = useState(false);
  const team = useResource<{ canManage: boolean; you: string; members: Array<{ id: string; name: string; role: string; status: string }> }>("team", "/api/mobile/team", session?.token);
  const loadSlots = useCallback(async (date: string) => { const lid = r.data?.lead?.id; if (!lid) return []; return (await api<{ slots: Array<{ start: string; end: string }> }>(`/api/mobile/leads/${lid}/availability?date=${date}`, { token: session?.token })).slots; }, [r.data?.lead?.id, session?.token]);
  const scroll = useRef<ScrollView>(null);
  const autoDrafted = useRef(false);

  useEffect(() => { if (session && id) void api(`/api/mobile/conversations/${id}/read`, { method: "POST", token: session.token }).catch(() => {}); }, [id, session]);

  const draft = useCallback(async (mode: string) => {
    if (!session) return;
    setShowModes(false); setDrafting(mode); setDraftError(null);
    try {
      const d = await api<{ text?: string }>(`/api/mobile/conversations/${id}/draft`, { method: "POST", body: { mode }, token: session.token });
      if (d.text) { setText(d.text); setAiDrafted(true); }
    } catch (e) { setDraftError(describeError(e)); }
    finally { setDrafting(null); }
  }, [id, session]);

  useEffect(() => {
    if (draftParam && r.data && !autoDrafted.current && !text) { autoDrafted.current = true; void draft(draftParam); }
  }, [draftParam, r.data, text, draft]);

  async function send() {
    if (!session || !text.trim()) return;
    setSending(true);
    try {
      const res = await api<{ ok: true; delivered: boolean }>(`/api/mobile/conversations/${id}/reply`, { method: "POST", body: { body: text.trim(), aiDrafted }, token: session.token });
      setText(""); setAiDrafted(false);
      await r.reload();
      if (!res.delivered) Alert.alert("Saved to the thread", "It couldn't be delivered on this channel right now, so it's saved here and marked not delivered.");
      setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 200);
    } catch (e) { Alert.alert("Not sent", describeError(e)); }
    finally { setSending(false); }
  }
  async function summarize(m: Msg) {
    if (!session) return;
    setSummarizing(m.id);
    try {
      const s = await api<{ summary: string; source: string }>(`/api/mobile/messages/${m.id}/summary`, { method: "POST", token: session.token });
      r.setData((prev) => (prev ? { ...prev, messages: prev.messages.map((x) => (x.id === m.id ? { ...x, summary: s.summary, summarySource: s.source } : x)) } : prev));
    } catch (e) { Alert.alert("Couldn't summarize", describeError(e)); }
    finally { setSummarizing(null); }
  }
  async function followUp(days: number | null) {
    if (!session || !r.data?.lead) return;
    try {
      let at: string | null = null;
      if (days !== null) { const d = new Date(); d.setDate(d.getDate() + days); d.setHours(9, 0, 0, 0); at = d.toISOString(); }
      await api(`/api/mobile/leads/${r.data.lead.id}/follow-up`, { method: "POST", body: { at }, token: session.token });
      await r.reload();
    } catch (e) { Alert.alert("That didn't save", describeError(e)); }
  }
  async function book(startISO: string) {
    if (!session || !r.data?.lead) return;
    setBookBusy(true);
    try { const made = await api<{ bookingId: string }>(`/api/mobile/leads/${r.data.lead.id}/book`, { method: "POST", body: { startISO }, token: session.token }); setBooking(false); router.push({ pathname: "/booking/[id]", params: { id: made.bookingId } } as never); }
    catch (e) { Alert.alert("Couldn't book", describeError(e)); }
    finally { setBookBusy(false); }
  }
  async function tool(body: Record<string, unknown>, done?: string) {
    if (!session) return;
    setTools(false);
    try {
      const res = await api<{ ok: true; ruleFor?: string | null }>(`/api/mobile/conversations/${id}/tools`, { method: "POST", body, token: session.token });
      if (body.action === "delete" || (body.action === "archive" && body.archived)) { router.back(); return; }
      await r.reload();
      if (done) Alert.alert(done, res.ruleFor ? `Daythread will remember ${res.ruleFor}.` : undefined);
    } catch (e) { Alert.alert("That didn't work", describeError(e)); }
  }
  async function summarizeThread() {
    if (!session) return;
    setSummarizing("thread");
    try { await api(`/api/mobile/conversations/${id}/summary`, { method: "POST", token: session.token }); await r.reload(); }
    catch (e) { Alert.alert("Couldn't summarize", describeError(e)); }
    finally { setSummarizing(null); }
  }
  function openTools() {
    const t = r.data; if (!t) return;
    const items: Array<{ text: string; style?: "destructive" | "cancel"; onPress?: () => void }> = [
      { text: "Mark unread", onPress: () => tool({ action: "read", read: false }) },
      { text: "Archive", onPress: () => tool({ action: "archive", archived: true }) },
      t.isPerson ? { text: "Not a priority (automated)", onPress: () => tool({ action: "reclassify", category: "AUTOMATED" }, "Moved out of Priority") } : { text: "This is a person — show in Priority", onPress: () => tool({ action: "reclassify", category: "PRIORITY" }, "Now in Priority") },
      t.isPerson ? { text: "It's a vendor", onPress: () => tool({ action: "reclassify", category: "VENDOR" }, "Marked as a vendor") } : { text: "It's marketing", onPress: () => tool({ action: "reclassify", category: "PROMOTIONAL" }, "Marked as marketing") },
    ];
    if (t.client) items.push({ text: t.client.relationship === "CUSTOMER" ? "Not a customer (potential)" : "Mark as customer", onPress: () => tool({ action: "relationship", clientId: t.client!.id, relationship: t.client!.relationship === "CUSTOMER" ? "LEAD" : "CUSTOMER" }) });
    if (team.data?.members.length && team.data.members.length > 1) items.push({ text: "Assign to a teammate…", onPress: () => Alert.alert("Assign to", undefined, [...team.data!.members.filter((m) => m.status === "ACTIVE").map((m) => ({ text: m.name, onPress: () => tool({ action: "assign", membershipId: m.id }) })), { text: "Nobody", onPress: () => tool({ action: "assign", membershipId: null }) }, { text: "Cancel", style: "cancel" as const }]) });
    items.push({ text: "Delete conversation", style: "destructive", onPress: () => Alert.alert("Delete this conversation?", "Its messages are removed for everyone in the workspace. This can't be undone.", [{ text: "Keep it", style: "cancel" }, { text: "Delete", style: "destructive", onPress: () => tool({ action: "delete" }) }]) });
    items.push({ text: "Cancel", style: "cancel" });
    Alert.alert(t.name, "What would you like to do?", items);
  }
  async function stage(status: "QUALIFIED" | "COLD" | "LOST") {
    if (!session || !r.data?.lead) return;
    try { await api(`/api/mobile/leads/${r.data.lead.id}/status`, { method: "POST", body: { status }, token: session.token }); await r.reload(); }
    catch (e) { Alert.alert("That didn't save", describeError(e)); }
  }
  const t = r.data;

  return (
    <Screen>
      <Header back title={t?.name ?? "Conversation"} subtitle={t ? `${channelLabel(t.channel)}${t.subject ? ` · ${t.subject}` : ""}` : undefined} right={t ? <View style={{ flexDirection: "row" }}>{t.client && <Pressable onPress={() => router.push(`/person/${t.client!.id}` as never)} accessibilityRole="button" accessibilityLabel={`Open ${t.name}'s profile`} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}><Ionicons name="person-circle-outline" size={26} color={c.ink} /></Pressable>}<Pressable onPress={() => { setTools(true); openTools(); }} accessibilityRole="button" accessibilityLabel="More actions" accessibilityState={{ expanded: tools }} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}><Ionicons name="ellipsis-horizontal-circle-outline" size={26} color={c.ink} /></Pressable></View> : undefined} />
      {r.stale && <StaleBanner at={r.cachedAt} onRetry={r.reload} />}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={0}>
        {r.loading && !t ? <Skeleton lines={6} /> : !t ? <ErrorState message={r.error ?? "Couldn't load this conversation."} onRetry={r.reload} /> : (
          <ScrollView ref={scroll} contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.lg, gap: spacing.sm }} keyboardDismissMode="interactive" onContentSizeChange={() => { if (!expanded.size) scroll.current?.scrollToEnd({ animated: false }); }}>
            {t.isPerson && (
              <Card tone="accent" style={{ marginBottom: spacing.sm }}>
                <Text style={{ ...type.micro, color: c.accentText, textTransform: "uppercase" }}>Why this matters</Text>
                <Text style={{ ...type.body, color: c.ink, marginTop: 4, lineHeight: 21 }}><Text style={{ fontWeight: "700" }}>{t.opportunity.label}.</Text> {t.opportunity.reason}</Text>
                {t.relationship && <Text style={{ ...type.small, color: c.inkSoft, marginTop: 6 }}>Where things stand: <Text style={{ fontWeight: "600", color: c.ink }}>{t.relationship.label}</Text> — {t.relationship.standing}</Text>}
                {t.facts.length > 0 && <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 }}>{t.facts.map((f) => <Badge key={f.label} tone="neutral">{f.label}: {f.value}</Badge>)}</View>}
                {t.upcoming && <Pressable onPress={() => router.push(`/booking/${t.upcoming!.id}` as never)} accessibilityRole="button" accessibilityLabel={`On the calendar: ${t.upcoming.label}${t.upcoming.confirmed ? "" : ", not confirmed"}`} style={{ marginTop: 8, minHeight: 44, justifyContent: "center" }}><Text style={{ ...type.small, color: c.successText, fontWeight: "600" }}>On the calendar: {t.upcoming.label}{t.upcoming.confirmed ? "" : " · not confirmed"} →</Text></Pressable>}
              </Card>
            )}
            {t.summary ? <Note>{t.summary.summary} <Text style={{ color: c.inkFaint }}>· {t.summary.source === "ai" ? "AI summary" : "from the record"}</Text></Note> : t.isPerson && t.messages.length > 1 ? <Pressable onPress={summarizeThread} accessibilityRole="button" accessibilityLabel="Summarize this conversation" style={{ minHeight: 44, justifyContent: "center" }}><Text style={{ ...type.small, color: c.accentText, fontWeight: "600" }}>{summarizing === "thread" ? "Summarizing the conversation…" : "Summarize the whole conversation"}</Text></Pressable> : null}
            {t.messages.map((m) => {
              const mine = m.direction === "OUTBOUND";
              const open = expanded.has(m.id);
              return (
                <View key={m.id} style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "88%" }} accessible accessibilityLabel={`${mine ? "You" : t.name}, ${ago(m.createdAt)}: ${m.text}`}>
                  <View style={{ backgroundColor: mine ? c.bubbleOut : c.bubbleIn, borderRadius: radius.lg, borderWidth: mine ? 0 : 1, borderColor: c.border, padding: spacing.md }}>
                    <Text style={{ ...type.body, color: mine ? c.white : c.ink, lineHeight: 21 }} selectable>{open ? m.original : m.text}</Text>
                    {m.hasMore && <Pressable onPress={() => setExpanded((s) => { const n = new Set(s); n.has(m.id) ? n.delete(m.id) : n.add(m.id); return n; })} accessibilityRole="button" style={{ minHeight: 40, justifyContent: "center" }}><Text style={{ ...type.small, color: mine ? "rgba(255,255,255,0.7)" : c.inkFaint }}>{open ? "Hide quoted text" : "Show original"}</Text></Pressable>}
                    {m.summary && <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: mine ? "rgba(255,255,255,0.2)" : c.border }}><Text style={{ ...type.small, color: mine ? "rgba(255,255,255,0.85)" : c.inkSoft }}>{m.summary} <Text style={{ color: mine ? "rgba(255,255,255,0.6)" : c.inkFaint }}>· {m.summarySource === "ai" ? "AI" : "rules"}</Text></Text></View>}
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 2, alignSelf: mine ? "flex-end" : "flex-start" }}>
                    <Text style={{ ...type.small, color: c.inkFaint }}>{ago(m.createdAt)}{mine && m.status && m.status !== "SENT" ? ` · ${m.status === "NOT_DELIVERED" ? "not delivered" : m.status.toLowerCase()}` : ""}{m.aiDrafted ? " · AI-drafted" : ""}</Text>
                    {!mine && !m.summary && <Pressable onPress={() => summarize(m)} accessibilityRole="button" accessibilityLabel="Summarize this message" style={{ minHeight: 40, justifyContent: "center" }}><Text style={{ ...type.small, color: c.accentText, fontWeight: "600" }}>{summarizing === m.id ? "Summarizing…" : "Summarize"}</Text></Pressable>}
                  </View>
                </View>
              );
            })}
            {t.lead && t.lead.canBook && (
              <Card style={{ marginTop: spacing.sm }}>
                <Text style={{ ...type.micro, color: c.inkFaint, textTransform: "uppercase", marginBottom: 6 }}>Book them from here</Text>
                {!booking ? <Button small variant="accent" icon="calendar-outline" title={t.facts.some((f) => f.label === "Service") ? "Find a time" : "Find a time (assign a service first)"} disabled={!t.facts.some((f) => f.label === "Service")} onPress={() => setBooking(true)} /> : <SlotPicker load={loadSlots} onPick={book} busy={bookBusy} confirmLabel="Book" />}
                {booking && <Button small variant="ghost" title="Not now" onPress={() => setBooking(false)} />}
                <Text style={{ ...type.micro, color: c.inkFaint, textTransform: "uppercase", marginTop: spacing.md, marginBottom: 6 }}>Follow-up</Text>
                <Text style={{ ...type.small, color: c.inkSoft, marginBottom: 8 }}>{t.lead.followUpAt ? `Reminder set for ${new Date(t.lead.followUpAt).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}.` : "No reminder set."}</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                  <Button small variant="secondary" title="Tomorrow" onPress={() => followUp(1)} />
                  <Button small variant="secondary" title="In 3 days" onPress={() => followUp(3)} />
                  {t.lead.followUpAt && <Button small variant="ghost" title="Clear" onPress={() => followUp(null)} />}
                </View>
                <Text style={{ ...type.micro, color: c.inkFaint, textTransform: "uppercase", marginTop: spacing.md, marginBottom: 6 }}>Stage</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                  <Button small variant={t.lead.status === "QUALIFIED" ? "primary" : "secondary"} title="Qualified" onPress={() => stage("QUALIFIED")} />
                  <Button small variant={t.lead.status === "COLD" ? "primary" : "secondary"} title="Set aside" onPress={() => stage("COLD")} />
                  <Button small variant="secondary" title="Mark lost" onPress={() => Alert.alert("Mark lost?", "They can always come back; this just takes them off your list.", [{ text: "Cancel", style: "cancel" }, { text: "Mark lost", style: "destructive", onPress: () => stage("LOST") }])} />
                </View>
              </Card>
            )}
          </ScrollView>
        )}
        {t && (
          <View style={{ borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.card, padding: spacing.md, paddingBottom: Math.max(insets.bottom, spacing.md) }}>
            {t.window && !t.window.open && <View style={{ marginBottom: 8 }}><Note tone="warning">{t.window.text}</Note></View>}
            {showModes && (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 8 }} accessibilityRole="menu">
                {MODES.map(([k, label]) => <Button key={k} small variant="secondary" title={label} onPress={() => draft(k)} loading={drafting === k} />)}
              </View>
            )}
            <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
              <Pressable onPress={() => setShowModes((v) => !v)} accessibilityRole="button" accessibilityLabel="Draft with AI" accessibilityState={{ expanded: showModes }} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.accentSoft, alignItems: "center", justifyContent: "center" }}>{drafting ? <Ionicons name="hourglass-outline" size={20} color={c.accentText} /> : <Ionicons name="sparkles" size={20} color={c.accentText} />}</Pressable>
              <TextInput value={text} onChangeText={(v) => { setText(v); if (aiDrafted && v !== text) setAiDrafted(false); }} placeholder={t.isPerson ? `Reply to ${t.name.split(" ")[0]}…` : "Write a note…"} placeholderTextColor={c.inkFaint} multiline accessibilityLabel="Your reply" style={{ flex: 1, minHeight: 44, maxHeight: 160, borderWidth: 1, borderColor: c.borderStrong, borderRadius: radius.lg, paddingHorizontal: 14, paddingVertical: 10, fontSize: 16, color: c.ink, backgroundColor: c.paper }} />
              <Pressable onPress={send} disabled={!text.trim() || sending} accessibilityRole="button" accessibilityLabel="Send" accessibilityState={{ disabled: !text.trim() || sending }} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: text.trim() ? c.accent : c.border, alignItems: "center", justifyContent: "center" }}><Ionicons name={sending ? "hourglass-outline" : "arrow-up"} size={20} color={text.trim() ? c.white : c.inkFaint} /></Pressable>
            </View>
            {aiDrafted && <Text style={{ ...type.small, color: c.inkFaint, marginTop: 6 }}>Drafted by Daythread from your notes and price list. Read it before you send.</Text>}
            {draftError && <Text accessibilityLiveRegion="polite" style={{ ...type.small, color: c.warningText, marginTop: 6 }}>{draftError}</Text>}
          </View>
        )}
      </KeyboardAvoidingView>
    </Screen>
  );
}
