import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, NetworkError } from "./api";

/**
 * Last-good cache: every read the app makes is remembered on the device, so a screen opens
 * with what it showed last time and the network only has to catch up. Offline, the cached
 * copy stays on screen and says so. Never used for anything that must be current before
 * an action — sending, booking and deleting always go to the server.
 */
const PREFIX = "dt:cache:";

export async function readCache<T>(key: string): Promise<{ data: T; at: number } | null> {
  try {
    const raw = await AsyncStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as { data: T; at: number }) : null;
  } catch {
    return null;
  }
}
export async function writeCache<T>(key: string, data: T): Promise<void> {
  try { await AsyncStorage.setItem(PREFIX + key, JSON.stringify({ data, at: Date.now() })); } catch { /* storage is a convenience */ }
}
export async function clearCache(): Promise<void> {
  try {
    const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(PREFIX));
    if (keys.length) await AsyncStorage.multiRemove(keys);
  } catch { /* ignore */ }
}

export type Resource<T> = {
  data: T | null;
  loading: boolean; // nothing to show yet
  refreshing: boolean; // pull-to-refresh in progress
  error: string | null; // the last fetch failed; data may still be the cached copy
  stale: boolean; // showing the cached copy because the network failed
  cachedAt: number | null;
  reload: () => Promise<void>;
  refresh: () => Promise<void>;
  setData: (next: T | ((prev: T | null) => T | null)) => void;
};

export function useResource<T>(key: string | null, path: string | null, token: string | null | undefined, deps: unknown[] = []): Resource<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [cachedAt, setCachedAt] = useState<number | null>(null);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const fetchNow = useCallback(async () => {
    if (!path || !token) return;
    try {
      const fresh = await api<T>(path, { token });
      if (!alive.current) return;
      setData(fresh); setError(null); setStale(false); setCachedAt(Date.now());
      if (key) void writeCache(key, fresh);
    } catch (err) {
      if (!alive.current) return;
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setStale(err instanceof NetworkError);
    }
  }, [path, token, key]);

  const reload = useCallback(async () => {
    setLoading((l) => l && data === null);
    await fetchNow();
    if (alive.current) setLoading(false);
  }, [fetchNow, data]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await fetchNow();
    if (alive.current) setRefreshing(false);
  }, [fetchNow]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (key) {
        const cached = await readCache<T>(key);
        if (cached && !cancelled) { setData(cached.data); setCachedAt(cached.at); setLoading(false); }
      }
      await fetchNow();
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, path, token, ...deps]);

  return { data, loading, refreshing, error, stale, cachedAt, reload, refresh, setData: (next) => setData((prev) => (typeof next === "function" ? (next as (p: T | null) => T | null)(prev) : next)) };
}
