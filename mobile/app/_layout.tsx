import { useEffect } from "react";
import { Stack, router, usePathname } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "../lib/auth-context";
import { useTheme } from "../lib/theme";
import { listenForNotificationTaps } from "../lib/notifications";

const PUBLIC = ["/login", "/signup", "/forgot"];

/**
 * The session guard: the moment there is no session — sign-out, a token the server refused,
 * a cold start with nothing stored — whatever screen is open gives way to sign-in. A tap on
 * a push notification opens the thread it names once a session exists.
 */
function Guard({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  const pathname = usePathname();
  useEffect(() => {
    if (loading) return;
    if (!session && !PUBLIC.includes(pathname)) router.replace("/login");
  }, [session, loading, pathname]);
  useEffect(() => {
    if (!session) return;
    let off: (() => void) | undefined;
    listenForNotificationTaps().then((fn) => { off = fn; });
    return () => off?.();
  }, [session]);
  return <>{children}</>;
}

export default function RootLayout() {
  const { c, dark } = useTheme();
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <Guard>
            <StatusBar style={dark ? "light" : "dark"} />
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.paper }, animation: "default" }}>
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="login" />
              <Stack.Screen name="signup" />
            </Stack>
          </Guard>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
