import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from "react";
import { storage } from "./storage";
import { api, setUnauthorizedHandler } from "./api";
import { clearCache } from "./cache";
import { registerForPush, unregisterPush } from "./notifications";

const TOKEN_KEY = "daythread_token";

export type Role = "OWNER" | "ADMIN" | "PHOTOGRAPHER" | "PARTNER" | "CLIENT";
export type Session = { token: string; user: { id: string; name: string; email: string }; business: { id: string; name: string; onboardingComplete: boolean }; role: Role };
export type SignupInput = { name: string; email: string; password: string; answers?: Record<string, unknown>; selectedPlan?: string };

type AuthState = {
  session: Session | null;
  loading: boolean; // restoring from the keychain on cold start
  expired: boolean; // the last session ended because the server refused it
  login: (email: string, password: string) => Promise<void>;
  signup: (input: SignupInput) => Promise<void>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
  /** Take over a token issued for another workspace (the switcher). */
  adoptSession: (token: string, me: { user: Session["user"]; business: Session["business"]; role: Role }) => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);
type Me = { user: Session["user"]; business: Session["business"]; role: Role };

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [expired, setExpired] = useState(false);
  const pushToken = useRef<string | null>(null);

  const drop = useCallback(async (why: "logout" | "expired") => {
    const token = session?.token ?? (await storage.getItem(TOKEN_KEY));
    if (token && why === "logout") await unregisterPush(token, pushToken.current);
    pushToken.current = null;
    await storage.deleteItem(TOKEN_KEY);
    await clearCache();
    setSession(null);
    setExpired(why === "expired");
  }, [session?.token]);

  // A 401 anywhere ends the session: the token expired, the password changed, or the
  // membership was removed. The guard in the layout sends the person to sign in.
  useEffect(() => {
    setUnauthorizedHandler(() => { void drop("expired"); });
    return () => setUnauthorizedHandler(null);
  }, [drop]);

  const adopt = useCallback(async (token: string, me: Me) => {
    await storage.setItem(TOKEN_KEY, token);
    setSession({ token, ...me });
    setExpired(false);
    registerForPush(token).then((t) => { pushToken.current = t; });
  }, []);

  // Cold start: a stored token is checked against the server before anyone is "signed in".
  useEffect(() => {
    (async () => {
      try {
        const token = await storage.getItem(TOKEN_KEY);
        if (!token) return;
        const me = await api<Me>("/api/mobile/me", { token });
        await adopt(token, me);
      } catch {
        // Offline on cold start keeps the token: the guard lets cached screens show, and
        // the first successful request proves the session. A refusal (401) already dropped it.
        const token = await storage.getItem(TOKEN_KEY);
        if (token) setSession((s) => s ?? { token, user: { id: "", name: "", email: "" }, business: { id: "", name: "", onboardingComplete: true }, role: "OWNER" });
      } finally {
        setLoading(false);
      }
    })();
  }, [adopt]);

  const login = useCallback(async (email: string, password: string) => {
    const r = await api<{ token: string } & Me>("/api/mobile/auth/login", { method: "POST", body: { email, password } });
    await adopt(r.token, { user: r.user, business: r.business, role: r.role });
  }, [adopt]);

  const signup = useCallback(async (input: SignupInput) => {
    const r = await api<{ token: string } & Me>("/api/mobile/auth/signup", { method: "POST", body: input });
    await adopt(r.token, { user: r.user, business: r.business, role: r.role });
  }, [adopt]);

  const refreshMe = useCallback(async () => {
    if (!session) return;
    const me = await api<Me>("/api/mobile/me", { token: session.token });
    setSession({ token: session.token, ...me });
  }, [session]);

  const logout = useCallback(() => drop("logout"), [drop]);

  const adoptSession = useCallback(async (token: string, me: Me) => { await clearCache(); await adopt(token, me); }, [adopt]);
  return <AuthContext.Provider value={{ session, loading, expired, login, signup, logout, refreshMe, adoptSession }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
