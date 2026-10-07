import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AuthStatus = "loading" | "signed-out" | "signed-in";

type AuthState = {
  status: AuthStatus;
  user: User | null;
  session: Session | null;
  /** True when the cloud backend is not configured; the app stays local-only. */
  unavailable: boolean;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  signUpWithPassword: (email: string, password: string) => Promise<{ needsConfirmation: boolean }>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthState | null>(null);

const friendly = (e: { message: string }) => {
  const m = e.message.toLowerCase();
  if (m.includes("invalid login")) return "That email and password do not match.";
  if (m.includes("already registered") || m.includes("already been registered"))
    return "That email already has an account. Sign in instead.";
  if (m.includes("password should be")) return "Choose a password of at least 6 characters.";
  if (m.includes("rate limit") || m.includes("too many"))
    return "Too many attempts. Wait a moment and try again.";
  if (m.includes("missing supabase"))
    return "Accounts are not connected yet. Everything still works on this device.";
  if (m.includes("failed to fetch") || m.includes("network"))
    return "Could not reach the account service. Check your connection.";
  return e.message;
};

/**
 * Session state only. Everything the app does works signed out: local storage
 * stays the source of truth, and sync is layered on top when a session exists.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let live = true;
    let unsubscribe = () => {};
    try {
      const { data } = supabase.auth.onAuthStateChange((_event, next) => {
        if (!live) return;
        setSession(next);
        setStatus(next ? "signed-in" : "signed-out");
      });
      unsubscribe = () => data.subscription.unsubscribe();
      void supabase.auth
        .getSession()
        .then(({ data }) => {
          if (!live) return;
          setSession(data.session);
          setStatus(data.session ? "signed-in" : "signed-out");
        })
        .catch(() => {
          if (!live) return;
          setUnavailable(true);
          setStatus("signed-out");
        });
    } catch {
      if (!live) return;
      setUnavailable(true);
      setStatus("signed-out");
    }
    return () => {
      live = false;
      unsubscribe();
    };
  }, []);

  const signInWithPassword = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw new Error(friendly(error));
  }, []);

  const signUpWithPassword = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
    if (error) throw new Error(friendly(error));
    return { needsConfirmation: !data.session };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    // Lovable Cloud issues this client id for the project's authorised origins.
    const clientId = import.meta.env["VITE_GOOGLE_CLIENT_ID"] as string | undefined;
    if (!clientId)
      throw new Error(
        "Google sign-in is not configured for this project yet. Use email and password.",
      );
    const redirectTo =
      typeof window !== "undefined" ? `${window.location.origin}/settings` : undefined;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: redirectTo ? { redirectTo } : {},
    });
    if (error) throw new Error(friendly(error));
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      status,
      user: session?.user ?? null,
      session,
      unavailable,
      signInWithPassword,
      signUpWithPassword,
      signInWithGoogle,
      signOut,
    }),
    [
      status,
      session,
      unavailable,
      signInWithPassword,
      signUpWithPassword,
      signInWithGoogle,
      signOut,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth outside provider");
  return c;
}
