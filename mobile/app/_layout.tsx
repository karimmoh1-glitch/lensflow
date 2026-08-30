import { useEffect } from "react";
import { Stack, router, usePathname } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { AuthProvider, useAuth } from "../lib/auth-context";
import { colors } from "../lib/theme";

const PUBLIC_ROUTES = ["/login", "/signup"];

/** Central session guard — redirects to /login the moment `session` becomes null
 * (explicit logout, or a stored token that failed re-validation on cold start), from
 * whatever screen the user happens to be on. Screens themselves never need to think
 * about this. */
function SessionGuard({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return;
    const isPublic = PUBLIC_ROUTES.includes(pathname);
    if (!session && !isPublic) {
      router.replace("/login");
    }
  }, [session, loading, pathname]);

  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <SessionGuard>
          <StatusBar style="dark" />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.paper },
            }}
          />
        </SessionGuard>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
