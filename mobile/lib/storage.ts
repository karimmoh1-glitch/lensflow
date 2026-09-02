import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

// expo-secure-store is native-only (iOS Keychain / Android Keystore). On web there's no
// secure-enclave equivalent, so we fall back to localStorage there — used only for local
// dev/testing in a browser; the real target (Expo Go / a native build) always uses
// SecureStore's encrypted storage.
export const storage = {
  async getItem(key: string): Promise<string | null> {
    if (Platform.OS === "web") {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    }
    return SecureStore.getItemAsync(key);
  },
  async setItem(key: string, value: string): Promise<void> {
    if (Platform.OS === "web") {
      try {
        localStorage.setItem(key, value);
      } catch {
        /* ignore */
      }
      return;
    }
    await SecureStore.setItemAsync(key, value);
  },
  async deleteItem(key: string): Promise<void> {
    if (Platform.OS === "web") {
      try {
        localStorage.removeItem(key);
      } catch {
        /* ignore */
      }
      return;
    }
    await SecureStore.deleteItemAsync(key);
  },
};
