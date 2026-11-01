import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";

// Vite inlines these at build time: on Vercel, redeploy after changing them.
// The key may use Supabase's current name (PUBLISHABLE_KEY) or the legacy one (ANON_KEY).
const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
const publicKey = (
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ??
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)
)?.trim();

export const isSupabaseConfigured = Boolean(url && publicKey);

const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  identity_already_exists: "That Google account is already connected to a different Needle account.",
  access_denied: "Google sign-in was cancelled.",
};

// How Supabase reports the database refusing a new Google connection (migration 004).
const GOOGLE_REFUSED = /error creating identity|account_change_not_authorized/i;
const GOOGLE_REFUSED_MESSAGE =
  "Google wasn't connected. If this email already has a Needle account, sign in with your password and connect Google from Settings. If you were already doing that, try again.";

/**
 * Why the Google redirect that opened this page failed, if it did. Read and removed
 * from the URL before the router or auth client see it, so a route guard's redirect
 * can't lose it and a reload doesn't repeat it.
 */
export let oauthError: string | null = (() => {
  const query = new URLSearchParams(window.location.search);
  const fragment = new URLSearchParams(window.location.hash.slice(1));
  const params = query.has("error") || query.has("error_code") ? query : fragment;
  const code = params.get("error_code") ?? params.get("error");
  if (!code) return null;
  const description = params.get("error_description");
  const message =
    OAUTH_ERROR_MESSAGES[code] ??
    (description && GOOGLE_REFUSED.test(description) ? GOOGLE_REFUSED_MESSAGE : description) ??
    "Signing in with Google didn't work. Try again.";
  for (const key of ["error", "error_code", "error_description", "sb"]) {
    query.delete(key);
    fragment.delete(key);
  }
  const rest = `${query.size ? `?${query}` : ""}${fragment.size ? `#${fragment}` : ""}`;
  window.history.replaceState(window.history.state, "", `${window.location.pathname}${rest}`);
  return message;
})();

export function clearOAuthError() {
  oauthError = null;
}

/** Env vars that were missing from this build, for error messages. */
export const missingSupabaseEnv = [
  !url && "VITE_SUPABASE_URL",
  !publicKey && "VITE_SUPABASE_PUBLISHABLE_KEY",
].filter((name): name is string => Boolean(name));

/**
 * Typed Supabase client, or `null` until VITE_SUPABASE_URL and
 * VITE_SUPABASE_PUBLISHABLE_KEY are set (.env.local locally, Vercel env vars in
 * production). The rating page reports an error while this is null.
 */
export const supabase: SupabaseClient<Database> | null = isSupabaseConfigured
  ? createClient<Database>(url!, publicKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        // Binds the Google redirect's returned code to this browser, so an intercepted one is useless.
        flowType: "pkce",
      },
    })
  : null;

/** Whether Google is turned on for this project (Authentication → Sign In / Providers). */
export async function googleSignInEnabled(): Promise<boolean> {
  const response = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: publicKey! } });
  if (!response.ok) return false;
  const settings = (await response.json()) as { external?: { google?: boolean } };
  return Boolean(settings.external?.google);
}

/** Storage bucket for user-uploaded album covers (see supabase/schema.sql). */
export const COVER_BUCKET = "album-covers";
