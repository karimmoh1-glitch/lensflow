import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text } from "react-native";
import { Link } from "expo-router";
import { api, describeError } from "../lib/api";
import { Button, Field, Screen } from "../components/ui";
import { spacing, type, useTheme } from "../lib/theme";

/** Same reset as the web: the email gets a single-use link; the response never says whether the address exists. */
export default function ForgotScreen() {
  const { c } = useTheme();
  const [email, setEmail] = useState(""); const [sent, setSent] = useState(false); const [error, setError] = useState<string | null>(null); const [pending, setPending] = useState(false);
  async function submit() {
    setError(null); setPending(true);
    try { await api("/api/mobile/auth/forgot", { method: "POST", body: { email: email.trim().toLowerCase() } }); setSent(true); }
    catch (e) { setError(describeError(e)); }
    finally { setPending(false); }
  }
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: spacing.xl }} keyboardShouldPersistTaps="handled">
          <Text accessibilityRole="header" style={{ ...type.title, color: c.ink, marginBottom: 4 }}>Reset your password</Text>
          {sent ? <Text style={{ ...type.body, color: c.inkSoft, lineHeight: 22 }}>If there's an account for {email.trim()}, a reset link is on its way. It works once and expires in an hour.</Text> : (
            <>
              <Text style={{ ...type.body, color: c.inkSoft, marginBottom: spacing.xl }}>We'll email you a link to choose a new one.</Text>
              <Field label="Email" autoCapitalize="none" keyboardType="email-address" autoComplete="email" value={email} onChangeText={setEmail} placeholder="you@studio.com" returnKeyType="send" onSubmitEditing={submit} />
              {error ? <Text accessibilityLiveRegion="polite" style={{ color: c.dangerText, fontSize: 14, marginBottom: spacing.md }}>{error}</Text> : null}
              <Button title="Send reset link" onPress={submit} loading={pending} disabled={!/\S+@\S+\.\S+/.test(email)} />
            </>
          )}
          <Link href="/login" replace accessibilityRole="link" style={{ alignSelf: "center", marginTop: spacing.xl, minHeight: 44 }}><Text style={{ color: c.accentText, fontSize: 14, fontWeight: "700" }}>Back to sign in</Text></Link>
        </ScrollView>
      </Screen>
    </KeyboardAvoidingView>
  );
}
