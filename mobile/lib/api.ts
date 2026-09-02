const BASE_URL = process.env.EXPO_PUBLIC_API_URL;

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/**
 * Every screen goes through this — same Daythread backend/database the web dashboard uses,
 * just over a bearer token instead of a cookie. Throws ApiError on any non-2xx so screens
 * can show the real backend message rather than a generic "something went wrong."
 */
export async function api<T = unknown>(
  path: string,
  options: { method?: string; body?: unknown; token?: string | null } = {}
): Promise<T> {
  if (!BASE_URL) {
    throw new ApiError(
      "EXPO_PUBLIC_API_URL is not set. Add mobile/.env with your Mac's LAN IP and restart Expo.",
      0
    );
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    throw new ApiError((data && data.error) || `Request failed (${res.status})`, res.status);
  }
  return data as T;
}
