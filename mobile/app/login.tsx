import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { Link, router } from "expo-router";
import { useAuth } from "../lib/auth-context";
import { ApiError } from "../lib/api";
import { Button, Field, Screen } from "../components/ui";
import { colors, spacing } from "../lib/theme";

export default function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState("alex@demo.lensflow.app");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleLogin() {
    setError(null);
    setPending(true);
    try {
      await login(email.trim(), password);
      router.replace("/home");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: spacing.xl }} keyboardShouldPersistTaps="handled">
          <Text style={{ fontSize: 24, fontWeight: "700", color: colors.ink, marginBottom: 4 }}>Daythread</Text>
          <Text style={{ fontSize: 15, color: colors.inkSoft, marginBottom: spacing.xl }}>Welcome back.</Text>

          <Field label="Email" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} placeholder="alex@studio.com" />
          <Field label="Password" secureTextEntry value={password} onChangeText={setPassword} placeholder="••••••••" />

          {error ? <Text style={{ color: colors.danger, fontSize: 14, marginBottom: spacing.md }}>{error}</Text> : null}

          <Button title="Log in" onPress={handleLogin} loading={pending} disabled={!email || !password} style={{ marginTop: spacing.sm }} />

          <View style={{ flexDirection: "row", justifyContent: "center", marginTop: spacing.xl, gap: 4 }}>
            <Text style={{ color: colors.inkSoft, fontSize: 14 }}>Don&apos;t have an account?</Text>
            <Link href="/signup" replace>
              <Text style={{ color: colors.accentText, fontSize: 14, fontWeight: "600" }}>Start free</Text>
            </Link>
          </View>
        </ScrollView>
      </Screen>
    </KeyboardAvoidingView>
  );
}
