import { Redirect } from "expo-router";
import { useAuth } from "../lib/auth-context";
import { Loading, Screen } from "../components/ui";

export default function Index() {
  const { session, loading } = useAuth();
  if (loading) return <Screen><Loading /></Screen>;
  return <Redirect href={session ? "/(tabs)/today" : "/login"} />;
}
