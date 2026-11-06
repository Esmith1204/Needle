import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { getProfileById } from "../lib/api";
import { supabase } from "../lib/supabase";
import type { Profile } from "../types";

// Tracks the Supabase auth session and the signed-in user's profile.
//   loading        – waiting for the stored session / profile
//   unconfigured   – Supabase env vars missing from this build
//   signedOut      – no session: only /login and /signup are reachable
//   needsTwoFactor – signed in, but the account's 2FA code hasn't been entered yet
//   needsProfile   – signed in, and the database says the account has no profile row yet
//   error          – signed in, but the account couldn't be loaded (e.g. a dropped connection).
//                    The address stays as it is, so trying again lands back on the same page.
//   ready          – signed in with a profile (`user` is set)

export type SessionStatus =
  | "loading"
  | "unconfigured"
  | "signedOut"
  | "needsTwoFactor"
  | "needsProfile"
  | "error"
  | "ready";

interface Session {
  status: SessionStatus;
  /** Auth user id; set whenever there is a session. */
  userId: string | null;
  email: string | null;
  /** The signed-in user's profile; set when status is "ready". */
  user: Profile | null;
  /** Error from loading the profile, if any. */
  error: string | null;
  /** Re-read the profile, e.g. after changing it. If that fails once signed in, the profile already loaded stays. */
  refreshProfile: () => Promise<void>;
  /** Loads the account again after status "error". */
  retry: () => void;
}

const SessionContext = createContext<Session | null>(null);

const PROFILE_ATTEMPTS = 3;
const PROFILE_TIMEOUT_MS = 15_000;

/** A phone's connection often drops for a moment, and that mustn't look like an account without a profile. */
async function fetchProfile(id: string): Promise<Profile | null> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await getProfileById(id, AbortSignal.timeout(PROFILE_TIMEOUT_MS));
    } catch (err) {
      if (attempt >= PROFILE_ATTEMPTS) throw err;
      await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
    }
  }
}

const COULD_NOT_LOAD = "Your account didn't load. Check your connection and try again.";

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>(supabase ? "loading" : "unconfigured");
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [user, setUser] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const seenUser = useRef<string | null>(null);
  const loadedFor = useRef<string | null>(null);

  /** Once signed in, a failed reload keeps the page working with what's already there. */
  const reportFailure = useCallback((id: string, err: unknown) => {
    // Signed out (or in as someone else) while it was failing: that's the state to keep.
    if (seenUser.current !== id) return;
    setError((err as Error)?.message || COULD_NOT_LOAD);
    setStatus((current) => (current === "ready" ? current : "error"));
  }, []);

  /** Throws if the profile couldn't be read, after reporting it. */
  const loadProfile = useCallback(
    async (id: string) => {
      try {
        const profile = await fetchProfile(id);
        if (seenUser.current !== id) return;
        setUser(profile);
        setError(null);
        setStatus(profile ? "ready" : "needsProfile");
      } catch (err) {
        reportFailure(id, err);
        throw err;
      }
    },
    [reportFailure],
  );

  /** Holds the profile back until an account with 2FA on has passed it, whichever way it signed in. */
  const syncSession = useCallback(
    async (id: string) => {
      try {
        const { data: level, error: levelError } = await supabase!.auth.mfa.getAuthenticatorAssuranceLevel();
        // Unknown isn't the same as "no 2FA": carrying on would show a 2FA account the welcome page.
        if (levelError) throw levelError;
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
      } catch (err) {
        // So that trying again, or the next auth event, loads it again.
        loadedFor.current = null;
        reportFailure(id, err);
      }
    },
    [loadProfile, reportFailure],
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

  const retry = useCallback(() => {
    if (!userId) return;
    loadedFor.current = null;
    setStatus("loading");
    void syncSession(userId);
  }, [userId, syncSession]);

  // Coming back online is the most likely moment for it to work.
  useEffect(() => {
    if (status !== "error") return;
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [status, retry]);

  const refreshProfile = useCallback(async () => {
    if (userId) await loadProfile(userId);
  }, [userId, loadProfile]);

  return (
    <SessionContext.Provider value={{ status, userId, email, user, error, refreshProfile, retry }}>
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
