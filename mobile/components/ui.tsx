import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps, type ViewProps } from "react-native";
import type { ReactNode } from "react";
import { colors, radius, spacing, type } from "../lib/theme";

export function Screen({ children, style }: { children: ReactNode; style?: ViewProps["style"] }) {
  return <View style={[styles.screen, style]}>{children}</View>;
}

export function Card({ children, style }: { children: ReactNode; style?: ViewProps["style"] }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function ScreenTitle({ children, subtitle }: { children: ReactNode; subtitle?: string }) {
  return (
    <View style={{ marginBottom: spacing.lg }}>
      <Text style={styles.title}>{children}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export function Button({
  title,
  onPress,
  variant = "primary",
  loading,
  disabled,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewProps["style"];
}) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.button,
        variant === "primary" && styles.buttonPrimary,
        variant === "secondary" && styles.buttonSecondary,
        variant === "ghost" && styles.buttonGhost,
        variant === "danger" && styles.buttonDanger,
        isDisabled && { opacity: 0.5 },
        pressed && !isDisabled && { opacity: 0.85 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === "primary" || variant === "danger" ? colors.white : colors.ink} />
      ) : (
        <Text
          style={[
            styles.buttonText,
            variant === "primary" && { color: colors.white },
            variant === "secondary" && { color: colors.ink },
            variant === "ghost" && { color: colors.accentText },
            variant === "danger" && { color: colors.white },
          ]}
        >
          {title}
        </Text>
      )}
    </Pressable>
  );
}

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput placeholderTextColor={colors.inkFaint} style={styles.input} {...props} />
    </View>
  );
}

type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "accent";
const toneStyles: Record<Tone, { bg: string; text: string }> = {
  neutral: { bg: "rgba(16,17,20,0.06)", text: colors.inkSoft },
  success: { bg: colors.successSoft, text: colors.successText },
  warning: { bg: colors.warningSoft, text: colors.warningText },
  danger: { bg: colors.dangerSoft, text: colors.dangerText },
  info: { bg: colors.infoSoft, text: colors.info },
  accent: { bg: colors.accentSoft, text: colors.accentText },
};

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: Tone }) {
  const t = toneStyles[tone];
  return (
    <View style={{ backgroundColor: t.bg, borderRadius: radius.full, paddingVertical: 4, paddingHorizontal: 10, alignSelf: "flex-start" }}>
      <Text style={{ color: t.text, fontSize: 12, fontWeight: "600" }}>{children}</Text>
    </View>
  );
}

export function Row({ children, style }: { children: ReactNode; style?: ViewProps["style"] }) {
  return <View style={[{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, style]}>{children}</View>;
}

export function Divider() {
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: spacing.md }} />;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.lg,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 1 },
  },
  title: { ...type.title, color: colors.ink },
  subtitle: { ...type.body, color: colors.inkSoft, marginTop: 4 },
  sectionLabel: { ...type.micro, color: colors.inkFaint, textTransform: "uppercase", marginBottom: spacing.sm },
  button: { borderRadius: radius.md, paddingVertical: 14, alignItems: "center", justifyContent: "center" },
  buttonPrimary: { backgroundColor: colors.ink },
  buttonSecondary: { backgroundColor: "rgba(16,17,20,0.06)" },
  buttonGhost: { backgroundColor: "transparent" },
  buttonDanger: { backgroundColor: colors.danger },
  buttonText: { fontSize: 15, fontWeight: "600" },
  fieldLabel: { ...type.small, color: colors.inkSoft, marginBottom: 6, fontWeight: "500" },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.ink,
    backgroundColor: colors.white,
  },
});
