import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type PressableProps, type TextInputProps, type ViewProps } from "react-native";
import { useEffect, useState, type ReactNode } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useIsFocused } from "expo-router";
import { radius, spacing, type, useTheme } from "../lib/theme";

/** Every piece here reads the theme, so light and dark are both complete; every control is ≥44pt and labelled. */

export function Screen({ children, style }: { children?: ReactNode; style?: ViewProps["style"] }) {
  const { c } = useTheme();
  return <View style={[{ flex: 1, backgroundColor: c.paper }, style]}>{children}</View>;
}

export function Header({ title, back, right, subtitle }: { title: string; back?: boolean; right?: ReactNode; subtitle?: string }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ paddingTop: insets.top + spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: c.paper }}>
      {back && (
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/today" as never))} accessibilityRole="button" accessibilityLabel="Back" hitSlop={8} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center", marginLeft: -12 }}>
          <Ionicons name="chevron-back" size={26} color={c.ink} />
        </Pressable>
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text accessibilityRole="header" numberOfLines={1} style={{ ...type.heading, color: c.ink }}>{title}</Text>
        {subtitle ? <Text style={{ ...type.small, color: c.inkSoft, marginTop: 2 }}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

export function Card({ children, style, tone = "card" }: { children: ReactNode; style?: ViewProps["style"]; tone?: "card" | "accent" | "success" | "signal" }) {
  const { c } = useTheme();
  const bg = tone === "accent" ? c.accentSoft : tone === "success" ? c.successSoft : tone === "signal" ? c.signalSoft : c.card;
  return <View style={[{ backgroundColor: bg, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border, padding: spacing.lg }, style]}>{children}</View>;
}

export function SectionLabel({ children, right }: { children: ReactNode; right?: ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginBottom: spacing.sm, marginTop: spacing.lg }}>
      <Text accessibilityRole="header" style={{ ...type.micro, color: c.inkFaint, textTransform: "uppercase" }}>{children}</Text>
      {right}
    </View>
  );
}

type Variant = "primary" | "secondary" | "ghost" | "danger" | "accent";
export function Button({ title, onPress, variant = "primary", loading, disabled, style, small, icon }: { title: string; onPress: () => void; variant?: Variant; loading?: boolean; disabled?: boolean; style?: ViewProps["style"]; small?: boolean; icon?: keyof typeof Ionicons.glyphMap }) {
  const { c } = useTheme();
  const off = disabled || loading;
  const bg = variant === "primary" ? c.ink : variant === "accent" ? c.accent : variant === "danger" ? c.danger : variant === "secondary" ? c.card : "transparent";
  const fg = variant === "primary" ? c.paper : variant === "accent" || variant === "danger" ? c.white : variant === "ghost" ? c.accentText : c.ink;
  return (
    <Pressable onPress={onPress} disabled={off} accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled: off, busy: Boolean(loading) }} style={({ pressed }) => [{ minHeight: small ? 40 : 48, paddingHorizontal: small ? 14 : 18, borderRadius: radius.full, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6, backgroundColor: bg, borderWidth: variant === "secondary" ? StyleSheet.hairlineWidth : 0, borderColor: c.borderStrong }, off && { opacity: 0.5 }, pressed && !off && { opacity: 0.85 }, style]}>
      {loading ? <ActivityIndicator color={fg} /> : (
        <>
          {icon ? <Ionicons name={icon} size={16} color={fg} /> : null}
          <Text style={{ fontSize: small ? 14 : 15, fontWeight: "700", color: fg }} maxFontSizeMultiplier={1.4}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

export function Field({ label, hint, error, ...props }: TextInputProps & { label: string; hint?: string; error?: string | null }) {
  const { c } = useTheme();
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={{ ...type.small, color: c.inkSoft, marginBottom: 6, fontWeight: "600" }}>{label}</Text>
      <TextInput accessibilityLabel={label} placeholderTextColor={c.inkFaint} style={{ minHeight: 48, borderWidth: StyleSheet.hairlineWidth, borderColor: error ? c.danger : c.borderStrong, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: c.ink, backgroundColor: c.card, textAlignVertical: props.multiline ? "top" : "center" }} {...props} />
      {error ? <Text style={{ ...type.small, color: c.dangerText, marginTop: 4 }}>{error}</Text> : hint ? <Text style={{ ...type.small, color: c.inkFaint, marginTop: 4 }}>{hint}</Text> : null}
    </View>
  );
}

type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "accent";
export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: Tone }) {
  const { c } = useTheme();
  const t = { neutral: [c.border, c.inkSoft], success: [c.successSoft, c.successText], warning: [c.warningSoft, c.warningText], danger: [c.dangerSoft, c.dangerText], info: [c.infoSoft, c.signalText], accent: [c.accentSoft, c.accentText] }[tone];
  return (
    <View style={{ backgroundColor: t[0], borderRadius: radius.full, paddingVertical: 4, paddingHorizontal: 10, alignSelf: "flex-start" }}>
      <Text style={{ color: t[1], fontSize: 12, fontWeight: "700" }} maxFontSizeMultiplier={1.3}>{children}</Text>
    </View>
  );
}

export function Chip({ label, active, onPress, count }: { label: string; active: boolean; onPress: () => void; count?: number }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="tab" accessibilityState={{ selected: active }} accessibilityLabel={count !== undefined ? `${label}, ${count}` : label} style={({ pressed }) => [{ minHeight: 40, paddingHorizontal: 14, borderRadius: radius.full, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6, backgroundColor: active ? c.ink : c.card, borderWidth: StyleSheet.hairlineWidth, borderColor: active ? c.ink : c.borderStrong }, pressed && { opacity: 0.8 }]}>
      <Text style={{ fontSize: 14, fontWeight: "600", color: active ? c.paper : c.ink }} maxFontSizeMultiplier={1.3}>{label}</Text>
      {count !== undefined && count > 0 ? <Text style={{ fontSize: 12, fontWeight: "700", color: active ? c.paper : c.inkSoft }}>{count}</Text> : null}
    </Pressable>
  );
}

export function Row({ children, style }: { children: ReactNode; style?: ViewProps["style"] }) {
  return <View style={[{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md }, style]}>{children}</View>;
}

export function Divider() {
  const { c } = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.border, marginVertical: spacing.md }} />;
}

export function ListRow({ onPress, children, accessibilityLabel, trailing }: PressableProps & { children: ReactNode; accessibilityLabel: string; trailing?: ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border }}>
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel} style={({ pressed }) => [{ flex: 1, minHeight: 56, paddingVertical: spacing.md, flexDirection: "row", gap: spacing.md, alignItems: "center" }, pressed && { opacity: 0.6 }]}>
        {children}
      </Pressable>
      {trailing}
    </View>
  );
}

export function Avatar({ name, size = 40, tone = "accent" }: { name: string; size?: number; tone?: "accent" | "neutral" }) {
  const { c } = useTheme();
  const letters = name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
  const digits = /^\+?\d/.test(name);
  return (
    <View accessible={false} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: tone === "accent" ? c.accentSoft : c.border, alignItems: "center", justifyContent: "center" }}>
      {digits ? <Ionicons name="person-outline" size={size * 0.45} color={c.accentText} /> : <Text style={{ fontSize: size * 0.36, fontWeight: "800", color: tone === "accent" ? c.accentText : c.inkSoft }}>{letters || "?"}</Text>}
    </View>
  );
}

export function EmptyState({ icon = "sparkles-outline", title, body, action }: { icon?: keyof typeof Ionicons.glyphMap; title: string; body: string; action?: ReactNode }) {
  const { c } = useTheme();
  return (
    <View accessible accessibilityLabel={`${title}. ${body}`} style={{ alignItems: "center", paddingVertical: spacing.xxl, paddingHorizontal: spacing.xl, gap: spacing.sm }}>
      <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: c.accentSoft, alignItems: "center", justifyContent: "center", marginBottom: spacing.xs }}><Ionicons name={icon} size={24} color={c.accentText} /></View>
      <Text style={{ ...type.section, color: c.ink, textAlign: "center" }}>{title}</Text>
      <Text style={{ ...type.body, color: c.inkSoft, textAlign: "center", lineHeight: 21 }}>{body}</Text>
      {action ? <View style={{ marginTop: spacing.md }}>{action}</View> : null}
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { c } = useTheme();
  return (
    <View accessible accessibilityLiveRegion="polite" style={{ alignItems: "center", paddingVertical: spacing.xxl, paddingHorizontal: spacing.xl, gap: spacing.sm }}>
      <Ionicons name="cloud-offline-outline" size={28} color={c.inkFaint} />
      <Text style={{ ...type.body, color: c.inkSoft, textAlign: "center", lineHeight: 21 }}>{message}</Text>
      <Button title="Try again" variant="secondary" small onPress={onRetry} style={{ marginTop: spacing.sm }} />
    </View>
  );
}

/** "Showing what loaded earlier" — the cached copy is on screen because the network failed. */
export function StaleBanner({ at, onRetry }: { at: number | null; onRetry: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onRetry} accessibilityRole="button" accessibilityLabel="Offline, showing what loaded earlier. Tap to retry." style={{ marginHorizontal: spacing.lg, marginBottom: spacing.sm, backgroundColor: c.warningSoft, borderRadius: radius.md, paddingVertical: 10, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 8 }}>
      <Ionicons name="cloud-offline-outline" size={16} color={c.warningText} />
      <Text style={{ ...type.small, color: c.warningText, flex: 1 }}>Offline — showing what loaded {at ? ago(at) : "earlier"}. Tap to retry.</Text>
    </Pressable>
  );
}
function ago(at: number) {
  const m = Math.round((Date.now() - at) / 60000);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
}

export function Skeleton({ lines = 3 }: { lines?: number }) {
  const { c } = useTheme();
  const [on, setOn] = useState(true);
  useEffect(() => { const t = setInterval(() => setOn((v) => !v), 700); return () => clearInterval(t); }, []);
  return (
    <View accessibilityLabel="Loading" accessible style={{ padding: spacing.lg, gap: 10 }}>
      {Array.from({ length: lines }).map((_, i) => <View key={i} style={{ height: 14, borderRadius: 7, width: `${88 - i * 14}%`, backgroundColor: c.border, opacity: on ? 1 : 0.5 }} />)}
    </View>
  );
}

export function Loading() {
  const { c } = useTheme();
  return <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={c.ink} accessibilityLabel="Loading" /></View>;
}

export function Note({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "warning" | "success" }) {
  const { c } = useTheme();
  const bg = tone === "warning" ? c.warningSoft : tone === "success" ? c.successSoft : c.border;
  const fg = tone === "warning" ? c.warningText : tone === "success" ? c.successText : c.inkSoft;
  return <View style={{ backgroundColor: bg, borderRadius: radius.md, padding: 12 }}><Text style={{ ...type.small, color: fg, lineHeight: 18 }}>{children}</Text></View>;
}

/** A tab that isn't focused renders nothing: on web every tab scene stays mounted, and an inactive one would sit above the active one for hit-testing. */
export function useTabFocused(): boolean {
  return useIsFocused();
}
