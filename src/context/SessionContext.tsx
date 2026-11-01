import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { getProfileById } from "../lib/api";
import { supabase } from "../lib/supabase";
import type { Profile } from "../types";

// Tracks the Supabase auth session and the signed-in user's profile.
//   loading        – waiting for the stored session / profile
//   unconfigured   – Supabase env vars missing from this build
//   signedOut      – no session: only /login and /signup are reachable
//   needsTwoFactor – signed in, but the account's 2FA code hasn't been entered yet
//   needsProfile   – signed in, but the account has no profile row yet
//   ready          – signed in with a profile (`user` is set)

export type SessionStatus = "loading" | "unconfigured" | "signedOut" | "needsTwoFactor" | "needsProfile" | "ready";

interface Session {
  status: SessionStatus;
  /** Auth user id; set whenever there is a session. */
  userId: string | null;
  email: string | null;
  /** The signed-in user's profile; set when status is "ready". */
  user: Profile | null;
  /** Error from loading the profile, if any. */
  error: string | null;
  /** Re-read the profile, e.g. after creating it. */
  refreshProfile: () => Promise<void>;
}

const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>(supabase ? "loading" : "unconfigured");
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [user, setUser] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const seenUser = useRef<string | null>(null);
  const loadedFor = useRef<string | null>(null);

  const loadProfile = useCallback(async (id: string) => {
    try {
      const profile = await getProfileById(id);
      setUser(profile);
      setError(null);
      setStatus(profile ? "ready" : "needsProfile");
    } catch (err) {
      setError((err as Error).message);
      setStatus("needsProfile");
    }
  }, []);

  /** Holds the profile back until an account with 2FA on has passed it, whichever way it signed in. */
  const syncSession = useCallback(
    async (id: string) => {
      const { data: level } = await supabase!.auth.mfa.getAuthenticatorAssuranceLevel();
      if (level?.nextLevel === "aal2" && level.currentLevel !== "aal2") {
        loadedFor.current = null;
        setUser(null);
        setStatus("needsTwoFactor");
        return;
      }
      // Token refreshes re-fire this; only load the profile when the user changes.
      if (loadedFor.current === id) return;
      loadedFor.current = id;
      await loadProfile(id);
    },
    [loadProfile],
  );

  useEffect(() => {
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      const id = session?.user.id ?? null;
      setUserId(id);
      setEmail(session?.user.email ?? null);
      if (!id) {
        seenUser.current = null;
        loadedFor.current = null;
        setUser(null);
        setStatus("signedOut");
        return;
      }
      if (seenUser.current !== id) {
        seenUser.current = id;
        setStatus("loading");
      }
      // Supabase advises against awaiting other calls inside this callback.
      setTimeout(() => void syncSession(id), 0);
    });
    return () => data.subscription.unsubscribe();
  }, [syncSession]);

  const refreshProfile = useCallback(async () => {
    if (userId) await loadProfile(userId);
  }, [userId, loadProfile]);

  return (
    <SessionContext.Provider value={{ status, userId, email, user, error, refreshProfile }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error("useSession must be used inside <SessionProvider>");
  return session;
}

/** The signed-in user's profile. Only use inside routes guarded by <RequireAuth>. */
export function useCurrentUser(): Profile {
  const { user } = useSession();
  if (!user) throw new Error("useCurrentUser used outside a signed-in route");
  return user;
}
