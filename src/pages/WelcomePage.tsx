import { useState, type FormEvent } from "react";
import { AuthLayout } from "../components/AuthLayout";
import { HandleInput, ProfileNameInput } from "../components/ProfileFields";
import { useSession } from "../context/SessionContext";
import { useHandleCheck } from "../hooks/useHandleCheck";
import { createProfile, signOut } from "../lib/api";

/** Shown to signed-in accounts that don't have a profile row yet. */
export function WelcomePage() {
  const { userId, email, refreshProfile, error: sessionError } = useSession();
  const [displayName, setDisplayName] = useState("");
  const [handle, setHandle] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(sessionError);
  const handleCheck = useHandleCheck(handle);

  const nameError = displayName.trim() ? null : "Enter your name.";
  const handleError =
    handleCheck.status === "empty"
      ? "Pick a handle."
      : handleCheck.status === "invalid" || handleCheck.status === "taken"
        ? handleCheck.message
        : null;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setAttempted(true);
    if (!userId || nameError || handleError || handleCheck.status === "checking") return;
    setSubmitting(true);
    setError(null);
    try {
      await createProfile(userId, handle, displayName);
      await refreshProfile();
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title={
        <>
          One last
          <br />
          thing.
        </>
      }
      subtitle="Pick the name and handle people will see on your ratings."
    >
      <form noValidate onSubmit={onSubmit}>
        <h2 className="text-2xl font-extrabold leading-tight">Who&rsquo;s listening?</h2>
        {email && <p className="mt-1 text-sm text-muted">Signed in as {email}</p>}

        <ProfileNameInput
          value={displayName}
          onChange={setDisplayName}
          error={attempted ? nameError : null}
          className="mt-6"
        />
        <HandleInput
          value={handle}
          onChange={setHandle}
          check={handleCheck}
          error={attempted ? handleError : null}
          className="mt-4"
        />

        {error && (
          <p role="alert" className="mt-4 rounded-xl border border-danger/40 bg-card px-4 py-2.5 text-xs text-danger">
            {error}
          </p>
        )}

        <button type="submit" disabled={submitting} className="btn btn-primary mt-6 h-10 w-full">
          {submitting ? "Saving…" : "Continue"}
        </button>
        <button
          type="button"
          onClick={() => void signOut()}
          className="mt-4 w-full text-center text-sm text-muted underline underline-offset-4 hover:text-ink"
        >
          Sign out
        </button>
      </form>
    </AuthLayout>
  );
}
