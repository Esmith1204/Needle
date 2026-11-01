import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation } from "react-router";
import { AuthLayout } from "../components/AuthLayout";
import { Field } from "../components/FormField";
import { GoogleButton } from "../components/GoogleButton";
import { signIn } from "../lib/api";
import { clearOAuthError, oauthError } from "../lib/supabase";

export function LoginPage() {
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // Arriving back from a failed Google sign-in lands here with its reason.
  const [error, setError] = useState<string | null>(oauthError);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => clearOAuthError, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await signIn(email, password);
      // The session listener redirects once the profile has loaded.
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title={
        <>
          Rate what
          <br />
          you&rsquo;re hearing.
        </>
      }
      subtitle="Log albums on a 10-point scale, rank them against each other, and see what the people you follow are spinning."
    >
      <form noValidate onSubmit={onSubmit}>
        <h2 className="text-2xl font-extrabold leading-tight">Sign in</h2>
        <p className="mt-1 text-sm text-muted">Welcome back.</p>

        <GoogleButton returnTo={(location.state as { from?: string } | null)?.from} onError={setError} className="mt-6" />

        <Field label="Email" htmlFor="email" className="mt-4">
          {(describedBy) => (
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-describedby={describedBy}
              className="field"
            />
          )}
        </Field>
        <Field label="Password" htmlFor="password" className="mt-4">
          {(describedBy) => (
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-describedby={describedBy}
              className="field"
            />
          )}
        </Field>

        {error && (
          <p role="alert" className="mt-4 rounded-xl border border-danger/40 bg-card px-4 py-2.5 text-xs text-danger">
            {error}
          </p>
        )}

        <button type="submit" disabled={submitting} className="btn btn-primary mt-6 h-10 w-full">
          {submitting ? "Signing in…" : "Sign in"}
        </button>
        <p className="mt-4 text-center text-sm text-muted">
          New here?{" "}
          <Link to="/signup" state={location.state} className="font-bold text-accent hover:underline">
            Create an account
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
