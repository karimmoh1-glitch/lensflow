import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../../lib/auth-context";
import { Avatar, Screen , useTabFocused } from "../../components/ui";
import { radius, spacing, type, useTheme } from "../../lib/theme";

const ITEMS: Array<{ href: string; icon: keyof typeof Ionicons.glyphMap; title: string; body: string }> = [
  { href: "/settings/assistant", icon: "sparkles-outline", title: "Assistant", body: "Ask what to work on, who was quoted, what's going cold." },
  { href: "/settings/automations", icon: "flash-outline", title: "Automations", body: "Confirmations, reminders and follow-ups sent for you." },
  { href: "/settings/memory", icon: "book-outline", title: "Business memory", body: "What drafts are allowed to know about your business." },
  { href: "/settings/integrations", icon: "link-outline", title: "Channels", body: "Gmail, Instagram, WhatsApp, SMS, calendars." },
  { href: "/settings/team", icon: "people-circle-outline", title: "Team", body: "Who works in this workspace." },
  { href: "/settings/subscription", icon: "card-outline", title: "Subscription", body: "Your plan and what it includes." },
  { href: "/settings/account", icon: "person-circle-outline", title: "Account", body: "You, your workspace, sign out, delete." },
];

export default function MoreScreen() {
  const focused = useTabFocused();
  const { session, logout } = useAuth();
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  if (!focused) return <Screen />;
  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + spacing.lg, padding: spacing.lg, paddingBottom: spacing.xxl }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.xl }}>
          <Avatar name={session?.business.name ?? "?"} size={48} />
          <View style={{ flex: 1 }}>
            <Text accessibilityRole="header" style={{ ...type.heading, color: c.ink }} numberOfLines={1}>{session?.business.name}</Text>
            <Text style={{ ...type.small, color: c.inkSoft }} numberOfLines={1}>{session?.user.email}</Text>
          </View>
        </View>
        <View style={{ backgroundColor: c.card, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, overflow: "hidden" }}>
          {ITEMS.map((it, i) => (
            <Pressable key={it.href} onPress={() => router.push(it.href as never)} accessibilityRole="button" accessibilityLabel={`${it.title}. ${it.body}`} style={({ pressed }) => [{ minHeight: 64, flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: c.border }, pressed && { backgroundColor: c.paper }]}>
              <Ionicons name={it.icon} size={22} color={c.accentText} />
              <View style={{ flex: 1 }}>
                <Text style={{ ...type.bodyMedium, color: c.ink }}>{it.title}</Text>
                <Text style={{ ...type.small, color: c.inkSoft }}>{it.body}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={c.inkFaint} />
            </Pressable>
          ))}
        </View>
        <Pressable onPress={() => Alert.alert("Sign out?", "You can sign back in any time.", [{ text: "Cancel", style: "cancel" }, { text: "Sign out", style: "destructive", onPress: () => void logout() }])} accessibilityRole="button" accessibilityLabel="Sign out" style={{ minHeight: 48, alignItems: "center", justifyContent: "center", marginTop: spacing.xl }}>
          <Text style={{ ...type.bodyMedium, color: c.dangerText }}>Sign out</Text>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}
