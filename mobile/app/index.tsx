import { ActivityIndicator, Text, View } from "react-native";
import { Redirect } from "expo-router";
import { useAuth } from "../lib/auth-context";
import { colors, spacing } from "../lib/theme";

export default function Index() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.paper, alignItems: "center", justifyContent: "center", gap: spacing.md }}>
        <ActivityIndicator color={colors.ink} />
        <Text style={{ color: colors.inkSoft, fontSize: 15 }}>LensFlow</Text>
      </View>
    );
  }

  return <Redirect href={session ? "/home" : "/login"} />;
}
