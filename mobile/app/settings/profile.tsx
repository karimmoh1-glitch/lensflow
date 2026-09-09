import { useEffect, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Share, Text } from "react-native";
import { useAuth } from "../../lib/auth-context";
import { api, describeError } from "../../lib/api";
import { useResource } from "../../lib/cache";
import { Button, Card, Field, Header, Note, Screen } from "../../components/ui";
import { spacing, type, useTheme } from "../../lib/theme";

/** You: your name, what the workspace is called, the timezone times are shown in, your password, and your referral link. */
export default function ProfileScreen() {
  const { session, refreshMe } = useAuth();
  const { c } = useTheme();
  const biz = useResource<{ timezone: string }>("business", "/api/mobile/business", session?.token);
  const ref = useResource<{ url: string }>(session?.role === "OWNER" ? "referral" : null, session?.role === "OWNER" ? "/api/mobile/referral" : null, session?.token);
  const [name, setName] = useState(session?.user.name ?? ""); const [workspace, setWorkspace] = useState(session?.business.name ?? ""); const [tz, setTz] = useState("");
  const [current, setCurrent] = useState(""); const [next, setNext] = useState(""); const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => { if (biz.data && !tz) setTz(biz.data.timezone); }, [biz.data, tz]);
  async function saveProfile() {
    if (!session) return; setBusy("profile");
    try { await api("/api/mobile/profile", { method: "PUT", body: { name: name.trim(), workspaceName: workspace.trim(), timezone: tz.trim() }, token: session.token }); await refreshMe(); Alert.alert("Saved"); }
    catch (e) { Alert.alert("Not saved", describeError(e)); } finally { setBusy(null); }
  }
  async function savePassword() {
    if (!session) return; setBusy("password");
    try { await api("/api/mobile/password", { method: "POST", body: { current, next }, token: session.token }); setCurrent(""); setNext(""); Alert.alert("Password changed", "Other devices are signed out."); }
    catch (e) { Alert.alert("Not changed", describeError(e)); } finally { setBusy(null); }
  }
  return (
    <Screen>
      <Header back title="Profile" subtitle={session?.user.email} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl }} keyboardShouldPersistTaps="handled">
          <Card>
            <Field label="Your name" value={name} onChangeText={setName} maxLength={80} autoComplete="name" />
            <Field label="Workspace name" value={workspace} onChangeText={setWorkspace} maxLength={80} />
            <Field label="Timezone" value={tz} onChangeText={setTz} autoCapitalize="none" hint="Message times are shown in this zone." />
            <Button title="Save" loading={busy === "profile"} disabled={!name.trim() || !workspace.trim() || !tz.trim()} onPress={saveProfile} />
          </Card>
          <Card>
            <Text style={{ ...type.micro, color: c.inkFaint, textTransform: "uppercase", marginBottom: 8 }}>Password</Text>
            <Field label="Current password" secureTextEntry value={current} onChangeText={setCurrent} textContentType="password" />
            <Field label="New password" secureTextEntry value={next} onChangeText={setNext} textContentType="newPassword" hint="At least 8 characters." />
            <Button title="Change password" variant="secondary" loading={busy === "password"} disabled={!current || next.length < 8} onPress={savePassword} />
          </Card>
          {ref.data && (
            <Card tone="accent">
              <Text style={{ ...type.micro, color: c.accentText, textTransform: "uppercase", marginBottom: 6 }}>Refer another business</Text>
              <Text style={{ ...type.small, color: c.inkSoft, lineHeight: 19 }}>Anyone who signs up from your link is attributed to you. Send it to another owner who's drowning in messages.</Text>
              <Text style={{ ...type.small, color: c.ink, marginTop: 6 }} selectable>{ref.data.url}</Text>
              <Button small icon="share-outline" title="Share my link" style={{ marginTop: 8, alignSelf: "flex-start" }} onPress={() => Share.share({ message: `I've been using Daythread to keep up with customers — ${ref.data!.url}` })} />
            </Card>
          )}
          <Note>Deleting the workspace lives under Account.</Note>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
