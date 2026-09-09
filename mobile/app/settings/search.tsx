import { useEffect, useState } from "react";
import { FlatList, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../lib/auth-context";
import { api } from "../../lib/api";
import { Avatar, EmptyState, Header, ListRow, Screen } from "../../components/ui";
import { radius, spacing, type, useTheme } from "../../lib/theme";

type Hit = { kind: string; id: string; title: string; subtitle?: string | null; href?: string | null };

/** The web's command palette: people, conversations and bookings by name, subject or words in a message. */
export default function SearchScreen() {
  const { session } = useAuth();
  const { c } = useTheme();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [summary, setSummary] = useState<{ name: string; conversations: number; bookings: number; nextAction: string } | null>(null);
  useEffect(() => {
    if (!session || q.trim().length < 2) { setHits(null); setSummary(null); return; }
    const t = setTimeout(async () => {
      try { const r = await api<{ hits: Hit[]; summary?: typeof summary }>(`/api/mobile/search?q=${encodeURIComponent(q.trim())}`, { token: session.token }); setHits(r.hits); setSummary(r.summary ?? null); }
      catch { setHits([]); }
    }, 250);
    return () => clearTimeout(t);
  }, [q, session]);
  const open = (h: Hit) => {
    const href = h.href ?? "";
    const conv = href.match(/[?&]c=([^&]+)/)?.[1];
    if (conv) return router.push(`/conversation/${conv}` as never);
    if (href.startsWith("/dashboard/clients/")) return router.push(`/person/${href.split("/").pop()}` as never);
    if (href.startsWith("/dashboard/bookings/")) return router.push(`/booking/${href.split("/").pop()}` as never);
    if (h.kind === "client" || h.kind === "person") return router.push(`/person/${h.id}` as never);
    if (h.kind === "conversation") return router.push(`/conversation/${h.id}` as never);
    if (h.kind === "booking") return router.push(`/booking/${h.id}` as never);
  };
  return (
    <Screen>
      <Header back title="Search" />
      <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.sm }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: c.card, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, paddingHorizontal: 12, minHeight: 44 }}>
          <Ionicons name="search-outline" size={18} color={c.inkFaint} />
          <TextInput autoFocus value={q} onChangeText={setQ} placeholder="People, conversations, bookings…" placeholderTextColor={c.inkFaint} accessibilityLabel="Search everything" autoCapitalize="none" style={{ flex: 1, fontSize: 16, color: c.ink, minHeight: 44 }} />
        </View>
      </View>
      {summary && <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.sm }}><Text style={{ ...type.small, color: c.inkSoft }}>{summary.name}: {summary.conversations} conversations · {summary.bookings} bookings · {summary.nextAction}</Text></View>}
      <FlatList data={hits ?? []} keyExtractor={(h) => `${h.kind}-${h.id}`} contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, flexGrow: 1 }} keyboardDismissMode="on-drag"
        ListEmptyComponent={q.trim().length < 2 ? <EmptyState icon="search-outline" title="Type to search" body="Two letters is enough. Names, subjects and words inside messages all count." /> : hits === null ? null : <EmptyState icon="search-outline" title="Nothing matches" body={`Nothing mentions “${q.trim()}”.`} />}
        renderItem={({ item }) => (
          <ListRow onPress={() => open(item)} accessibilityLabel={`${item.title}${item.subtitle ? `, ${item.subtitle}` : ""}`}>
            <Avatar name={item.title} size={36} tone="neutral" />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ ...type.bodyMedium, color: c.ink }} numberOfLines={1}>{item.title}</Text>
              {item.subtitle ? <Text style={{ ...type.small, color: c.inkSoft }} numberOfLines={2}>{item.subtitle}</Text> : null}
            </View>
            <Text style={{ ...type.small, color: c.inkFaint }}>{item.kind}</Text>
          </ListRow>
        )}
      />
    </Screen>
  );
}
