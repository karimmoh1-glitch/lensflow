import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { storage } from "./storage";
import { api, ApiError } from "./api";

const TOKEN_KEY = "lensflow_token";

export type Role = "OWNER" | "ADMIN" | "PHOTOGRAPHER" | "PARTNER" | "CLIENT";

export type Session = {
  token: string;
  user: { id: string; name: string; email: string };
  business: { id: string; name: string; onboardingComplete: boolean };
  role: Role;
};

type AuthState = {
  session: Session | null;
  loading: boolean; // restoring from SecureStore on cold start
  login: (email: string, password: string) => Promise<void>;
  signup: (params: { name: string; email: string; password: string; businessName: string; businessType?: string; phone?: string }) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  // Session persistence: on cold start, re-validate the stored token against the real
  // backend (not just trust it's still valid) before treating the user as logged in.
  useEffect(() => {
    (async () => {
      try {
        const token = await storage.getItem(TOKEN_KEY);
        if (!token) return;
        const me = await api<{ user: Session["user"]; business: Session["business"]; role: Role }>("/api/mobile/me", { token });
        setSession({ token, ...me });
      } catch {
        await storage.deleteItem(TOKEN_KEY);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const result = await api<{ token: string; user: Session["user"]; business: Session["business"]; role: Role }>(
      "/api/mobile/auth/login",
      { method: "POST", body: { email, password } }
    );
    await storage.setItem(TOKEN_KEY, result.token);
    setSession({ token: result.token, user: result.user, business: result.business, role: result.role });
  }, []);

  const signup = useCallback(
    async (params: { name: string; email: string; password: string; businessName: string; businessType?: string; phone?: string }) => {
      const result = await api<{ token: string; user: Session["user"]; business: Session["business"]; role: Role }>(
        "/api/mobile/auth/signup",
        { method: "POST", body: params }
      );
      await storage.setItem(TOKEN_KEY, result.token);
      setSession({ token: result.token, user: result.user, business: result.business, role: result.role });
    },
    []
  );

  const logout = useCallback(async () => {
    await storage.deleteItem(TOKEN_KEY);
    setSession(null);
  }, []);

  return <AuthContext.Provider value={{ session, loading, login, signup, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export { ApiError };
