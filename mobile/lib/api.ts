const BASE_URL = process.env.EXPO_PUBLIC_API_URL;

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** The network itself failed (offline, DNS, timeout) — distinct from the server saying no. */
export class NetworkError extends Error {
  constructor(message = "Can't reach Daythread right now. Check your connection and try again.") {
    super(message);
  }
}

let onUnauthorized: (() => void) | null = null;
/** The auth context registers this: a 401 anywhere means the session is over. */
export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn;
}

/**
 * Every screen goes through this — the same Daythread backend and database the web uses,
 * over a bearer token. Throws ApiError with the server's own sentence on any non-2xx,
 * NetworkError when the request never completed, and hands a 401 to the session guard.
 */
export async function api<T = unknown>(path: string, options: { method?: string; body?: unknown; token?: string | null; timeoutMs?: number } = {}): Promise<T> {
  if (!BASE_URL) throw new ApiError("EXPO_PUBLIC_API_URL is not set.", 0);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 15_000);
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method: options.method ?? "GET",
      headers: { "Content-Type": "application/json", Accept: "application/json", ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}) },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    throw new NetworkError(err instanceof Error && err.name === "AbortError" ? "That took too long. Check your connection and try again." : undefined);
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (res.status === 401 && options.token) onUnauthorized?.();
  if (!res.ok) throw new ApiError((data && typeof data === "object" && "error" in data && typeof (data as { error: unknown }).error === "string" ? (data as { error: string }).error : null) ?? `Request failed (${res.status})`, res.status);
  return data as T;
}

export function describeError(err: unknown): string {
  if (err instanceof ApiError || err instanceof NetworkError) return err.message;
  return "Something went wrong. Try again.";
}
