import { useCallback, useMemo, useState } from "react";
import { FlatList, RefreshControl, Text, TextInput, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../../lib/auth-context";
import { api } from "../../lib/api";
import { useResource } from "../../lib/cache";
import { Avatar, Chip, EmptyState, ErrorState, ListRow, Screen, Skeleton, StaleBanner, Button , useTabFocused } from "../../components/ui";
import { radius, spacing, type, useTheme } from "../../lib/theme";
import { ago, CHANNEL } from "../../lib/format";

type Cat = "all" | "AUTOMATED" | "PROMOTIONAL" | "VENDOR" | "SPAM";
type Row = { id: string; channel: string; category: string; name: string; subject: string | null; preview: string; lastMessageAt: string; unread: boolean; waiting: boolean; label: string; reason: string; followUp: string | null };
type List = { rows: Row[]; counts: { priority: number; all: number; waiting: number; unread: number } };

/** Priority is people with business value, in value order — never every email. All is everything, newest first. */
export default function InboxScreen() {
  const focused = useTabFocused();
  const { session } = useAuth();
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const [view, setView] = useState<"priority" | "all">("priority");
  const [filter, setFilter] = useState<"all" | "waiting" | "unread">("all");
  const [cat, setCat] = useState<Cat>("all");
  const [channel, setChannel] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  useMemo(() => { const t = setTimeout(() => setDebounced(q.trim()), 250); return () => clearTimeout(t); }, [q]);
  const path = `/api/mobile/conversations?view=${view}&filter=${filter}${channel ? `&channel=${channel}` : ""}${debounced ? `&q=${encodeURIComponent(debounced)}` : ""}`;
  const r = useResource<List>(debounced ? null : `inbox:${view}:${filter}:${channel ?? ""}`, path, session?.token);
  const rows = (r.data?.rows ?? []).filter((x) => view === "priority" || cat === "all" || x.category === cat);
  const channels = Array.from(new Set((r.data?.rows ?? []).map((x) => x.channel)));
  const refresh = useCallback(async () => { if (session) await api("/api/mobile/gmail", { method: "POST", token: session.token }).catch(() => {}); await r.refresh(); }, [session, r]);
  useFocusEffect(useCallback(() => {
    void r.reload();
    // While this screen is in front, ask the server every 30 s whether the inbox version moved
    // (one indexed row) and reload only then. Never a provider call from the app.
    let last: number | null = null; let stopped = false;
    const tick = async () => { if (stopped || !session) return; try { const v = (await api<{ version: number }>("/api/mobile/sync", { token: session.token })).version; if (last !== null && v !== last) await r.reload(); last = v; } catch { /* next tick */ } };
    void tick();
    const id = setInterval(tick, 30_000);
    return () => { stopped = true; clearInterval(id); };
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [path, session?.token]));

  if (!focused) return <Screen />;
  return (
    <Screen>
      <View style={{ paddingTop: insets.top + spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, gap: spacing.sm }}>
        <Text accessibilityRole="header" style={{ ...type.heading, color: c.ink }}>Inbox</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: c.card, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, paddingHorizontal: 12, minHeight: 44 }}>
          <Ionicons name="search-outline" size={18} color={c.inkFaint} />
          <TextInput value={q} onChangeText={setQ} placeholder="Search people and messages" placeholderTextColor={c.inkFaint} accessibilityLabel="Search the inbox" returnKeyType="search" autoCapitalize="none" style={{ flex: 1, fontSize: 16, color: c.ink, minHeight: 44 }} />
          {q ? <Ionicons name="close-circle" size={18} color={c.inkFaint} onPress={() => setQ("")} accessibilityLabel="Clear search" accessibilityRole="button" /> : null}
        </View>
        <View style={{ flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" }}>
          <Chip label="Priority" active={view === "priority"} onPress={() => setView("priority")} count={r.data?.counts.priority} />
          <Chip label="All" active={view === "all"} onPress={() => setView("all")} count={r.data?.counts.all} />
          <View style={{ width: 1, backgroundColor: c.border, marginHorizontal: 2 }} />
          <Chip label="Waiting" active={filter === "waiting"} onPress={() => setFilter(filter === "waiting" ? "all" : "waiting")} count={r.data?.counts.waiting} />
          <Chip label="Unread" active={filter === "unread"} onPress={() => setFilter(filter === "unread" ? "all" : "unread")} count={r.data?.counts.unread} />
        </View>
        {(view === "all" || channels.length > 1) && (
          <View style={{ flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" }}>
            {view === "all" && (["all", "AUTOMATED", "PROMOTIONAL", "VENDOR", "SPAM"] as Cat[]).map((k) => <Chip key={k} label={k === "all" ? "Everything" : k === "AUTOMATED" ? "Automated" : k === "PROMOTIONAL" ? "Promotions" : k === "VENDOR" ? "Vendors" : "Spam"} active={cat === k} onPress={() => setCat(k)} />)}
            {channels.length > 1 && channels.map((ch) => <Chip key={ch} label={CHANNEL[ch]?.label ?? ch} active={channel === ch} onPress={() => setChannel(channel === ch ? null : ch)} />)}
          </View>
        )}
      </View>
      {r.stale && <StaleBanner at={r.cachedAt} onRetry={r.reload} />}
      {r.loading && !r.data ? <Skeleton lines={6} /> : !r.data ? <ErrorState message={r.error ?? "Couldn't load the inbox."} onRetry={r.reload} /> : (
        <FlatList
          data={rows}
          keyExtractor={(x) => x.id}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={r.refreshing} onRefresh={refresh} tintColor={c.ink} />}
          keyboardDismissMode="on-drag"
          ListEmptyComponent={
            debounced ? <EmptyState icon="search-outline" title="Nothing matches" body={`No conversation mentions “${debounced}”.`} />
            : view === "priority" ? <EmptyState icon="chatbubbles-outline" title="No one is waiting on you" body="Priority shows the people writing to your business. Newsletters, receipts and notifications stay in All. Connect a channel to start." action={<Button title="Connect a channel" small variant="secondary" onPress={() => router.push("/settings/integrations" as never)} />} />
            : <EmptyState icon="mail-outline" title="Nothing here yet" body="Connect Gmail, Instagram, WhatsApp or SMS and every message lands here, sorted into people and everything else." action={<Button title="Connect a channel" small variant="secondary" onPress={() => router.push("/settings/integrations" as never)} />} />
          }
          renderItem={({ item }) => {
            const ch = CHANNEL[item.channel];
            return (
              <ListRow onPress={() => router.push(`/conversation/${item.id}` as never)} accessibilityLabel={`${item.name}, ${ch?.label ?? item.channel}, ${item.unread ? "unread, " : ""}${item.reason || item.preview}`}>
                <View>
                  <Avatar name={item.name} tone={item.category === "PRIORITY" ? "accent" : "neutral"} />
                  {ch && <View style={{ position: "absolute", right: -4, bottom: -2, backgroundColor: c.card, borderRadius: 10, padding: 2 }}><Ionicons name={ch.icon} size={12} color={c.inkSoft} /></View>}
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
                    <Text style={{ ...type.bodyMedium, color: c.ink, flex: 1, fontWeight: item.unread ? "700" : "500" }} numberOfLines={1}>{item.name}</Text>
                    <Text style={{ ...type.small, color: c.inkFaint }}>{ago(item.lastMessageAt).replace(" ago", "")}</Text>
                  </View>
                  {item.category === "PRIORITY" && item.reason ? <Text style={{ ...type.small, color: item.waiting ? c.accentText : c.inkSoft, fontWeight: item.waiting ? "600" : "400" }} numberOfLines={1}>{item.followUp ? `${item.followUp} · ` : ""}{item.reason}</Text> : null}
                  <Text style={{ ...type.small, color: c.inkSoft }} numberOfLines={2}>{item.subject ? `${item.subject} — ` : ""}{item.preview}</Text>
                </View>
                {item.unread && <View accessible={false} style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.accent }} />}
              </ListRow>
            );
          }}
        />
      )}
    </Screen>
  );
}
