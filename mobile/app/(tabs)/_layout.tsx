import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../lib/theme";

const TAB: Array<{ name: string; title: string; icon: keyof typeof Ionicons.glyphMap; active: keyof typeof Ionicons.glyphMap }> = [
  { name: "today", title: "Today", icon: "sunny-outline", active: "sunny" },
  { name: "inbox", title: "Inbox", icon: "chatbubbles-outline", active: "chatbubbles" },
  { name: "people", title: "People", icon: "people-outline", active: "people" },
  { name: "calendar", title: "Calendar", icon: "calendar-outline", active: "calendar" },
  { name: "more", title: "More", icon: "ellipsis-horizontal-circle-outline", active: "ellipsis-horizontal-circle" },
];

export default function TabsLayout() {
  const { c } = useTheme();
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: c.accentText, tabBarInactiveTintColor: c.inkFaint, tabBarStyle: { backgroundColor: c.card, borderTopColor: c.border }, tabBarLabelStyle: { fontSize: 11, fontWeight: "600" }, sceneStyle: { backgroundColor: c.paper } }}>
      {TAB.map((t) => (
        <Tabs.Screen key={t.name} name={t.name} options={{ title: t.title, tabBarAccessibilityLabel: t.title, tabBarIcon: ({ color, focused, size }) => <Ionicons name={focused ? t.active : t.icon} size={size} color={color} /> }} />
      ))}
    </Tabs>
  );
}
