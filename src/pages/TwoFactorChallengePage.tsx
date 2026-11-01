import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { AuthLayout } from "../components/AuthLayout";
import { Field } from "../components/FormField";
import { TwoFactorCodeField } from "../components/TwoFactorCodeField";
import { useSession } from "../context/SessionContext";
import { redeemRecoveryCode, signOut, verifyTwoFactorCode } from "../lib/api";

/** Step two of signing in, after a password or Google, for accounts with 2FA on. */
export function TwoFactorChallengePage() {
  const { email } = useSession();
  const navigate = useNavigate();
  const [usingRecoveryCode, setUsingRecoveryCode] = useState(false);
  const [code, setCode] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!usingRecoveryCode && code.length !== 6) {
      setError("Enter the 6-digit code from your authenticator app.");
      return;
    }
    if (usingRecoveryCode && !recoveryCode.trim()) {
      setError("Enter your recovery code.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      if (usingRecoveryCode) {
        await redeemRecoveryCode(recoveryCode);
        navigate("/settings/security?recovered=1", { replace: true });
      } else {
        await verifyTwoFactorCode(code);
        // The session listener moves on once the profile has loaded.
      }
    } catch (err) {
      setError((err as Error).message);
      setCode("");
      setSubmitting(false);
    }
  };

  const switchMethod = () => {
    setUsingRecoveryCode(!usingRecoveryCode);
    setError(null);
  };

  return (
    <AuthLayout
      title={
        <>
          One more
          <br />
          step.
        </>
      }
      subtitle="Two-factor authentication keeps your account safe, even if someone else has your password."
    >
      <form noValidate onSubmit={onSubmit}>
        <h2 className="text-2xl font-extrabold leading-tight">
          {usingRecoveryCode ? "Enter your recovery code" : "Enter your code"}
        </h2>
        {usingRecoveryCode ? (
          <p className="mt-1 text-sm text-muted">
            This turns two-factor off and signs out your other devices, so you can set it up again with a new
            authenticator.
          </p>
        ) : (
          <p className="mt-1 text-sm text-muted">
            Open your authenticator app{email ? ` for ${email}` : ""} and enter the code it shows.
          </p>
        )}

        {usingRecoveryCode ? (
          <Field label="Recovery code" htmlFor="recovery-code" className="mt-6">
            {(describedBy) => (
              <input
                id="recovery-code"
                type="text"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                autoFocus
                value={recoveryCode}
                onChange={(e) => setRecoveryCode(e.target.value)}
                aria-describedby={describedBy}
                className="field tabular-nums"
              />
            )}
          </Field>
        ) : (
          <TwoFactorCodeField id="challenge-code" value={code} onChange={setCode} className="mt-6" autoFocus />
        )}

        {error && (
          <p role="alert" className="mt-4 rounded-xl border border-danger/40 bg-card px-4 py-2.5 text-xs text-danger">
            {error}
          </p>
        )}

        <button type="submit" disabled={submitting} className="btn btn-primary mt-6 h-10 w-full">
          {submitting ? "Checking…" : usingRecoveryCode ? "Use recovery code" : "Verify"}
        </button>
        <button
          type="button"
          onClick={switchMethod}
          className="mt-4 w-full text-center text-sm text-muted underline underline-offset-4 hover:text-ink"
        >
          {usingRecoveryCode ? "Use your authenticator app instead" : "Lost your authenticator?"}
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
