import { useState } from "react";
import { Alert, Linking, ScrollView, Text } from "react-native";
import { router } from "expo-router";
import { useAuth } from "../../lib/auth-context";
import { api, describeError } from "../../lib/api";
import { Button, Card, Field, Header, Note, Screen } from "../../components/ui";
import { spacing, type, useTheme } from "../../lib/theme";

const WEB = process.env.EXPO_PUBLIC_API_URL ?? "https://daythread.org";

/** You and your workspace. Deleting is the same path as the web's danger zone: the subscription is canceled first, and the account goes with the last workspace. */
export default function AccountScreen() {
  const { session, logout } = useAuth();
  const { c } = useTheme();
  const [confirm, setConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const owner = session?.role === "OWNER";
  async function destroy() {
    if (!session) return;
    Alert.alert("Delete this workspace?", "Every conversation, person and booking in it is deleted. This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        setDeleting(true);
        try { await api("/api/mobile/account", { method: "DELETE", body: { confirmName: confirm }, token: session.token }); await logout(); router.replace("/login"); }
        catch (e) { Alert.alert("Not deleted", describeError(e)); }
        finally { setDeleting(false); }
      } },
    ]);
  }
  return (
    <Screen>
      <Header back title="Account" />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl }} keyboardShouldPersistTaps="handled">
        <Card>
          <Text style={{ ...type.micro, color: c.inkFaint, textTransform: "uppercase" }}>Signed in as</Text>
          <Text style={{ ...type.section, color: c.ink, marginTop: 4 }}>{session?.user.name}</Text>
          <Text style={{ ...type.small, color: c.inkSoft }}>{session?.user.email}</Text>
          <Text style={{ ...type.small, color: c.inkSoft, marginTop: 8 }}>Workspace: {session?.business.name} · {session?.role === "OWNER" ? "owner" : session?.role.toLowerCase()}</Text>
        </Card>
        <Button title="Profile, password and workspace name on the web" variant="secondary" icon="open-outline" onPress={() => Linking.openURL(`${WEB}/dashboard/settings?tab=profile`)} />
        <Button title="Sign out" variant="secondary" onPress={() => void logout()} />
        {owner && (
          <Card style={{ borderColor: c.danger, marginTop: spacing.lg }}>
            <Text style={{ ...type.section, color: c.dangerText }}>Delete workspace</Text>
            <Text style={{ ...type.small, color: c.inkSoft, marginTop: 4, marginBottom: spacing.md, lineHeight: 18 }}>Cancels the subscription first, then deletes everything in {session?.business.name}. If it's your only workspace, your sign-in goes with it.</Text>
            <Field label={`Type ${session?.business.name} to confirm`} value={confirm} onChangeText={setConfirm} autoCapitalize="none" autoCorrect={false} />
            <Button title="Delete workspace" variant="danger" disabled={confirm.trim() !== session?.business.name} loading={deleting} onPress={destroy} />
          </Card>
        )}
        {!owner && <Note>Only the workspace owner can delete it.</Note>}
      </ScrollView>
    </Screen>
  );
}
