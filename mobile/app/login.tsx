import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View, Linking } from "react-native";
import { Link, router } from "expo-router";
import { useAuth } from "../lib/auth-context";
import { describeError } from "../lib/api";
import { Button, Field, Screen } from "../components/ui";
import { spacing, type, useTheme } from "../lib/theme";

const WEB = process.env.EXPO_PUBLIC_API_URL ?? "https://daythread.org";

export default function LoginScreen() {
  const { login, expired } = useAuth();
  const { c } = useTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit() {
    setError(null); setPending(true);
    try { await login(email.trim().toLowerCase(), password); router.replace("/(tabs)/today"); }
    catch (e) { setError(describeError(e)); }
    finally { setPending(false); }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: spacing.xl }} keyboardShouldPersistTaps="handled">
          <Text accessibilityRole="header" style={{ ...type.title, color: c.ink, marginBottom: 4 }}>Daythread</Text>
          <Text style={{ ...type.body, color: c.inkSoft, marginBottom: spacing.xl }}>{expired ? "Your session ended. Sign in again to pick up where you left off." : "Welcome back."}</Text>
          <Field label="Email" autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" value={email} onChangeText={setEmail} placeholder="you@studio.com" returnKeyType="next" />
          <Field label="Password" secureTextEntry autoComplete="password" textContentType="password" value={password} onChangeText={setPassword} placeholder="••••••••" returnKeyType="go" onSubmitEditing={submit} />
          {error ? <Text accessibilityLiveRegion="polite" style={{ color: c.dangerText, fontSize: 14, marginBottom: spacing.md }}>{error}</Text> : null}
          <Button title="Sign in" onPress={submit} loading={pending} disabled={!email || !password} style={{ marginTop: spacing.sm }} />
          <Pressable onPress={() => Linking.openURL(`${WEB}/forgot-password`)} accessibilityRole="link" style={{ alignSelf: "center", minHeight: 44, justifyContent: "center", marginTop: spacing.md }}>
            <Text style={{ color: c.inkSoft, fontSize: 14 }}>Forgot your password?</Text>
          </Pressable>
          <View style={{ flexDirection: "row", justifyContent: "center", marginTop: spacing.lg, gap: 4, alignItems: "center", minHeight: 44 }}>
            <Text style={{ color: c.inkSoft, fontSize: 14 }}>New here?</Text>
            <Link href="/signup" replace accessibilityRole="link"><Text style={{ color: c.accentText, fontSize: 14, fontWeight: "700" }}>Start free</Text></Link>
          </View>
        </ScrollView>
      </Screen>
    </KeyboardAvoidingView>
  );
}
