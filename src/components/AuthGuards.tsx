import { useState, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { useSession } from "../context/SessionContext";
import { signOut } from "../lib/api";
import { missingSupabaseEnv } from "../lib/supabase";
import { TwoFactorChallengePage } from "../pages/TwoFactorChallengePage";
import { Wordmark } from "./Wordmark";

/** Signed-in routes: everyone else is sent to /login (and back here afterwards). */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useSession();
  const location = useLocation();
  if (status === "unconfigured") return <NotConfigured />;
  if (status === "loading") return <Splash />;
  if (status === "error") return <CouldNotLoad />;
  if (status === "needsTwoFactor") return <TwoFactorChallengePage />;
  if (status === "signedOut") return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (status === "needsProfile") return <Navigate to="/welcome" replace />;
  return children;
}

/** /login and /signup: signed-in users skip straight to where they were going. */
export function PublicOnly({ children }: { children: ReactNode }) {
  const { status } = useSession();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "/";
  if (status === "unconfigured") return <NotConfigured />;
  if (status === "loading") return <Splash />;
  if (status === "error") return <CouldNotLoad />;
  if (status === "needsTwoFactor") return <TwoFactorChallengePage />;
  if (status === "ready") return <Navigate to={from} replace />;
  if (status === "needsProfile") return <Navigate to="/welcome" replace />;
  return children;
}

/** /welcome: signed in, but the account still needs a profile. */
export function RequireNoProfile({ children }: { children: ReactNode }) {
  const { status } = useSession();
  if (status === "unconfigured") return <NotConfigured />;
  if (status === "loading") return <Splash />;
  if (status === "error") return <CouldNotLoad />;
  if (status === "needsTwoFactor") return <TwoFactorChallengePage />;
  if (status === "signedOut") return <Navigate to="/login" replace />;
  if (status === "ready") return <Navigate to="/" replace />;
  return children;
}

function Splash() {
  return (
    <div className="grid min-h-dvh place-items-center" aria-busy="true" aria-label="Loading">
      <Wordmark className="text-2xl text-muted" />
    </div>
  );
}

/** Signed in, but the account didn't load. This page's address is kept, so it comes back once it does. */
function CouldNotLoad() {
  const { error, retry } = useSession();
  const [signingOut, setSigningOut] = useState(false);
  return (
    <div className="mx-auto grid min-h-dvh max-w-md place-items-center px-6 text-center">
      <div role="alert">
        <Wordmark className="text-2xl text-muted" />
        <p className="mt-6 text-xl font-extrabold">Needle didn&rsquo;t load.</p>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Your account couldn&rsquo;t be reached, which usually means the connection dropped. You&rsquo;re still signed
          in, and you&rsquo;ll come back to this page.
        </p>
        {error && <p className="mt-2 break-words text-xs text-muted">{error}</p>}
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <button type="button" onClick={retry} className="btn btn-primary">
            Try again
          </button>
          <button
            type="button"
            disabled={signingOut}
            onClick={() => {
              setSigningOut(true);
              void signOut().catch(() => setSigningOut(false));
            }}
            className="btn btn-outline"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

function NotConfigured() {
  return (
    <div className="mx-auto grid min-h-dvh max-w-xl place-items-center px-6 text-center">
      <div>
        <p className="text-2xl font-extrabold">Supabase isn't connected.</p>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          This build is missing <code className="text-ink">{missingSupabaseEnv.join(" and ")}</code>. Add it to{" "}
          <code className="text-ink">.env.local</code> and restart <code className="text-ink">npm run dev</code>, or
          add it in Vercel and redeploy.
        </p>
      </div>
    </div>
  );
}
