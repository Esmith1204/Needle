import { useState, type FormEvent } from "react";
import { Link, useLocation } from "react-router";
import { AuthLayout } from "../components/AuthLayout";
import { Field } from "../components/FormField";
import { GoogleButton } from "../components/GoogleButton";
import { HandleInput, ProfileNameInput } from "../components/ProfileFields";
import { useHandleCheck } from "../hooks/useHandleCheck";
import { signUp } from "../lib/api";
import { MIN_PASSWORD } from "../lib/format";

export function SignUpPage() {
  const location = useLocation();
  const [displayName, setDisplayName] = useState("");
  const [handle, setHandle] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmEmailFor, setConfirmEmailFor] = useState<string | null>(null);
  const handleCheck = useHandleCheck(handle);

  const errors = {
    displayName: displayName.trim() ? null : "Enter your name.",
    handle:
      handleCheck.status === "empty"
        ? "Pick a handle."
        : handleCheck.status === "invalid" || handleCheck.status === "taken"
          ? handleCheck.message
          : null,
    email: /^\S+@\S+\.\S+$/.test(email.trim()) ? null : "Enter a valid email.",
    password: password.length >= MIN_PASSWORD ? null : `Use at least ${MIN_PASSWORD} characters.`,
  };
  const shown = (key: keyof typeof errors) => (attempted ? errors[key] : null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setAttempted(true);
    if (Object.values(errors).some(Boolean) || handleCheck.status === "checking") return;
    setSubmitting(true);
    setError(null);
    try {
      const { needsEmailConfirmation } = await signUp({ email, password, handle, displayName });
      if (needsEmailConfirmation) setConfirmEmailFor(email.trim());
      // Otherwise the new session signs them in and the route guard redirects.
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const title = (
    <>
      Start your
      <br />
      record.
    </>
  );
  const subtitle = "Make a profile to log ratings, build your rankings, and add friends.";

  if (confirmEmailFor) {
    return (
      <AuthLayout title={title} subtitle={subtitle}>
        <h2 className="text-2xl font-extrabold leading-tight">Check your email</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          We sent a confirmation link to <span className="font-bold text-ink">{confirmEmailFor}</span>. Open it to
          activate your account, then sign in.
        </p>
        <Link to="/login" className="btn btn-primary mt-6 h-10 w-full">
          Go to sign in
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title={title} subtitle={subtitle}>
      <form noValidate onSubmit={onSubmit}>
        <h2 className="text-2xl font-extrabold leading-tight">Join Needle</h2>
        <p className="mt-1 text-sm text-muted">Create an account.</p>

        <GoogleButton returnTo={(location.state as { from?: string } | null)?.from} onError={setError} className="mt-6" />

        <ProfileNameInput value={displayName} onChange={setDisplayName} error={shown("displayName")} className="mt-4" />
        <HandleInput value={handle} onChange={setHandle} check={handleCheck} error={shown("handle")} className="mt-4" />

        <Field label="Email" htmlFor="email" error={shown("email")} className="mt-4">
          {(describedBy) => (
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={Boolean(shown("email")) || undefined}
              aria-describedby={describedBy}
              className="field"
            />
          )}
        </Field>
        <Field
          label="Password"
          htmlFor="password"
          error={shown("password")}
          hint={`At least ${MIN_PASSWORD} characters.`}
          className="mt-4"
        >
          {(describedBy) => (
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={Boolean(shown("password")) || undefined}
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
          {submitting ? "Creating account…" : "Create account"}
        </button>
        <p className="mt-4 text-center text-sm text-muted">
          Already have an account?{" "}
          <Link to="/login" state={location.state} className="font-bold text-accent hover:underline">
            Sign in
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
