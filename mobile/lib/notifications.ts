import { Platform } from "react-native";
import { router } from "expo-router";
import { api } from "./api";

/**
 * Push: an Expo push token per device, registered on the membership after sign-in and
 * removed at sign-out; a tap opens the path the server put in the notification. Only on a
 * physical device — the simulator and the web target have no push. Everything is guarded
 * so the app never fails to start because notifications did.
 */
type Notif = typeof import("expo-notifications");
async function load(): Promise<Notif | null> {
  if (Platform.OS === "web") return null;
  try { return await import("expo-notifications"); } catch { return null; }
}

export async function registerForPush(token: string): Promise<string | null> {
  const N = await load();
  if (!N) return null;
  try {
    const Device = await import("expo-device");
    if (!Device.isDevice) return null;
    const perm = await N.getPermissionsAsync();
    const status = perm.granted ? "granted" : (await N.requestPermissionsAsync()).status;
    if (status !== "granted") return null;
    if (Platform.OS === "android") await N.setNotificationChannelAsync("default", { name: "Daythread", importance: N.AndroidImportance.DEFAULT });
    const Constants = (await import("expo-constants")).default;
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    const expoToken = (await N.getExpoPushTokenAsync(projectId ? { projectId } : undefined)).data;
    await api("/api/mobile/push", { method: "POST", body: { token: expoToken }, token });
    return expoToken;
  } catch {
    return null;
  }
}

export async function unregisterPush(token: string, expoToken: string | null): Promise<void> {
  if (!expoToken) return;
  try { await api("/api/mobile/push", { method: "DELETE", body: { token: expoToken }, token }); } catch { /* the server drops dead tokens on its own */ }
}

/** Opens the screen a notification points at. Returns the unsubscribe. */
export async function listenForNotificationTaps(): Promise<() => void> {
  const N = await load();
  if (!N) return () => {};
  N.setNotificationHandler({ handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }) });
  const open = (path: unknown) => { if (typeof path === "string" && path.startsWith("/")) router.push(path as never); };
  const sub = N.addNotificationResponseReceivedListener((r) => open(r.notification.request.content.data?.path));
  const last = await N.getLastNotificationResponseAsync();
  if (last) open(last.notification.request.content.data?.path);
  return () => sub.remove();
}
