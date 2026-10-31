import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { useSession } from "../context/SessionContext";
import { missingSupabaseEnv } from "../lib/supabase";
import { Wordmark } from "./Wordmark";

/** Signed-in routes: everyone else is sent to /login (and back here afterwards). */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useSession();
  const location = useLocation();
  if (status === "unconfigured") return <NotConfigured />;
  if (status === "loading") return <Splash />;
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
  if (status === "ready") return <Navigate to={from} replace />;
  if (status === "needsProfile") return <Navigate to="/welcome" replace />;
  return children;
}

/** /welcome: signed in, but the account still needs a profile. */
export function RequireNoProfile({ children }: { children: ReactNode }) {
  const { status } = useSession();
  if (status === "unconfigured") return <NotConfigured />;
  if (status === "loading") return <Splash />;
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
