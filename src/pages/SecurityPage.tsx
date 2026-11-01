import { useState, type FormEvent } from "react";
import { Field } from "../components/FormField";
import { Alert, SecureAction, SectionHeading, SettingsPageShell, type RowProps } from "../components/SettingsPieces";
import { TwoFactorCodeField } from "../components/TwoFactorCodeField";
import {
  changePassword,
  confirmPassword,
  createRecoveryCode,
  finishTwoFactorSetup,
  startTwoFactorSetup,
  turnOffTwoFactor,
} from "../lib/api";
import { MIN_PASSWORD } from "../lib/format";
import type { AccountSecurity, TotpEnrollment } from "../types";

export function SecurityPage() {
  return (
    <SettingsPageShell title="Security">
      {({ security, resumeAction, onChanged }) => (
        <>
          <SectionHeading>Signing in</SectionHeading>
          <PasswordRow security={security} resumeAction={resumeAction} onChanged={onChanged} />
          <TwoFactorRow security={security} resumeAction={resumeAction} onChanged={onChanged} />
          {security.twoFactorEnabled && (
            <RecoveryCodeRow security={security} resumeAction={resumeAction} onChanged={onChanged} />
          )}
        </>
      )}
    </SettingsPageShell>
  );
}

// ─── Password ───────────────────────────────────────────────────────────────

function PasswordRow({ security, resumeAction, onChanged }: RowProps & { onChanged: () => void }) {
  const [saved, setSaved] = useState(false);
  return (
    <SecureAction
      id="password"
      title="Password"
      description={
        saved
          ? "Password saved. Other devices have been signed out."
          : security.hasPassword
            ? "Change the password you sign in with."
            : "You sign in with Google. Add a password to sign in with your email too."
      }
      actionLabel={security.hasPassword ? "Change password" : "Add password"}
      // The form asks for the current password itself, so asking first would ask twice.
      confirmedByForm={security.hasPassword && !security.twoFactorEnabled}
      security={security}
      resumeAction={resumeAction}
    >
      {(close) => (
        <PasswordForm
          security={security}
          onDone={() => {
            setSaved(true);
            onChanged();
            close();
          }}
        />
      )}
    </SecureAction>
  );
}

function PasswordForm({ security, onDone }: { security: AccountSecurity; onDone: () => void }) {
  const { email, hasPassword, twoFactorEnabled } = security;
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (hasPassword && !current) {
      setError("Enter your current password.");
      return;
    }
    if (password.length < MIN_PASSWORD) {
      setError(`Use at least ${MIN_PASSWORD} characters.`);
      return;
    }
    if (password !== repeat) {
      setError("Those passwords don't match.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      // Checking a password resets a 2FA session to step one. Those accounts just entered a
      // code, and Supabase compares the password below when "Require current password" is on.
      if (hasPassword && !twoFactorEnabled) await confirmPassword(email ?? "", current);
      await changePassword(password, hasPassword ? current : undefined);
      onDone();
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  };

  return (
    <form noValidate onSubmit={onSubmit}>
      {hasPassword && (
        <Field label="Current password" htmlFor="current-password" className="mb-3">
          {(describedBy) => (
            <input
              id="current-password"
              type="password"
              autoComplete="current-password"
              autoFocus
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              aria-describedby={describedBy}
              className="field"
            />
          )}
        </Field>
      )}
      <Field label="New password" htmlFor="new-password" hint={`At least ${MIN_PASSWORD} characters.`}>
        {(describedBy) => (
          <input
            id="new-password"
            type="password"
            autoComplete="new-password"
            autoFocus={!hasPassword}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-describedby={describedBy}
            className="field"
          />
        )}
      </Field>
      <Field label="Repeat new password" htmlFor="repeat-password" className="mt-3">
        {(describedBy) => (
          <input
            id="repeat-password"
            type="password"
            autoComplete="new-password"
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
            aria-describedby={describedBy}
            className="field"
          />
        )}
      </Field>
      {error && <Alert className="mt-3">{error}</Alert>}
      <button type="submit" disabled={submitting} className="btn btn-primary mt-4">
        {submitting ? "Saving…" : "Save password"}
      </button>
    </form>
  );
}

// ─── Two-factor authentication ──────────────────────────────────────────────

function TwoFactorRow({ security, resumeAction, onChanged }: RowProps & { onChanged: () => void }) {
  return (
    <SecureAction
      id="two-factor"
      title="Two-factor authentication"
      description={
        security.twoFactorEnabled
          ? "On. Signing in, with a password or with Google, also asks for a code from your authenticator app."
          : "Off. Turn it on to require a code from an authenticator app when you sign in, with a password or with Google."
      }
      actionLabel={security.twoFactorEnabled ? "Turn off" : "Turn on"}
      security={security}
      resumeAction={resumeAction}
    >
      {(close) =>
        security.twoFactorEnabled ? (
          <TurnOffTwoFactor
            onDone={() => {
              onChanged();
              close();
            }}
          />
        ) : (
          <TwoFactorSetup
            onDone={() => {
              onChanged();
              close();
            }}
          />
        )
      }
    </SecureAction>
  );
}

function TurnOffTwoFactor({ onDone }: { onDone: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onClick = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await turnOffTwoFactor();
      onDone();
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  };

  return (
    <div>
      <p className="text-sm">Your account will only be protected by how you sign in. You can turn this back on at any time.</p>
      {error && <Alert className="mt-3">{error}</Alert>}
      <button type="button" onClick={onClick} disabled={submitting} className="btn btn-danger mt-4">
        {submitting ? "Turning off…" : "Turn off two-factor"}
      </button>
    </div>
  );
}

function TwoFactorSetup({ onDone }: { onDone: () => void }) {
  const [enrollment, setEnrollment] = useState<TotpEnrollment | null>(null);
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onStart = async () => {
    setSubmitting(true);
    setError(null);
    try {
      setEnrollment(await startTwoFactorSetup());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const onVerify = async (e: FormEvent) => {
    e.preventDefault();
    if (!enrollment) return;
    if (code.length !== 6) {
      setError("Enter the 6-digit code from your authenticator app.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await finishTwoFactorSetup(enrollment.factorId, code);
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
      return;
    }
    try {
      setRecoveryCode(await createRecoveryCode());
    } catch {
      // Two-factor is on either way, and its settings row now offers to create a code.
      onDone();
    }
  };

  if (recoveryCode) return <RecoveryCodeNotice code={recoveryCode} onDone={onDone} />;

  if (!enrollment) {
    return (
      <div>
        <p className="text-sm">
          You&rsquo;ll need an authenticator app, like Google Authenticator, 1Password, or Authy.
        </p>
        <p className="mt-2 text-xs text-muted">
          You&rsquo;ll also get a recovery code to save, for getting back in if you lose your authenticator.
        </p>
        {error && <Alert className="mt-3">{error}</Alert>}
        <button type="button" onClick={onStart} disabled={submitting} className="btn btn-primary mt-4">
          {submitting ? "Preparing…" : "Show QR code"}
        </button>
      </div>
    );
  }

  return (
    <form noValidate onSubmit={onVerify}>
      <p className="text-sm">Scan this with your authenticator app, then enter the code it shows.</p>
      {/* White in every theme: scanners need dark squares on a light background. */}
      <img
        src={enrollment.qrCode}
        alt="QR code for your authenticator app. The same key is written out below."
        className="mt-3 size-44 rounded-xl bg-white p-2"
      />
      <p className="mt-2 text-xs text-muted">
        Can&rsquo;t scan it? Enter this key: <code className="break-all font-bold text-ink">{enrollment.secret}</code>
      </p>
      <TwoFactorCodeField id="setup-code" value={code} onChange={setCode} className="mt-3" />
      {error && <Alert className="mt-3">{error}</Alert>}
      <button type="submit" disabled={submitting} className="btn btn-primary mt-4">
        {submitting ? "Checking…" : "Turn on two-factor"}
      </button>
    </form>
  );
}

function RecoveryCodeRow({ security, resumeAction, onChanged }: RowProps & { onChanged: () => void }) {
  return (
    <SecureAction
      id="recovery-code"
      title="Recovery code"
      description={
        security.hasRecoveryCode
          ? "Saved. If you lose your authenticator, this gets you back in. It works once."
          : "You don't have one. Without it, losing your authenticator locks you out of your account."
      }
      actionLabel={security.hasRecoveryCode ? "Replace code" : "Create code"}
      security={security}
      resumeAction={resumeAction}
    >
      {(close) => (
        <NewRecoveryCode
          replacing={security.hasRecoveryCode}
          onDone={() => {
            onChanged();
            close();
          }}
        />
      )}
    </SecureAction>
  );
}

function NewRecoveryCode({ replacing, onDone }: { replacing: boolean; onDone: () => void }) {
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onClick = async () => {
    setSubmitting(true);
    setError(null);
    try {
      setRecoveryCode(await createRecoveryCode());
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  };

  if (recoveryCode) return <RecoveryCodeNotice code={recoveryCode} onDone={onDone} />;

  return (
    <div>
      {replacing && <p className="mb-4 text-sm">Your current recovery code will stop working.</p>}
      {error && <Alert className="mb-4">{error}</Alert>}
      <button type="button" onClick={onClick} disabled={submitting} className="btn btn-primary">
        {submitting ? "Creating…" : "Create recovery code"}
      </button>
    </div>
  );
}

/** Shows a new recovery code, which can't be read again after this. */
function RecoveryCodeNotice({ code, onDone }: { code: string; onDone: () => void }) {
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      // The code stays on screen to copy by hand.
    }
  };

  return (
    <div>
      <p className="text-sm font-bold">Save your recovery code</p>
      <p className="mt-1 text-xs text-muted">
        Keep it somewhere safe, like a password manager. You won&rsquo;t see it again. If you lose your authenticator,
        enter it after signing in to turn two-factor off and set it up again.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <code className="break-all rounded-xl bg-field px-3 py-2 text-sm font-bold tabular-nums text-ink">{code}</code>
        <button type="button" onClick={onCopy} className="btn btn-outline">
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={saved}
          onChange={(e) => setSaved(e.target.checked)}
          className="size-4 accent-accent"
        />
        I&rsquo;ve saved my recovery code
      </label>
      <button type="button" onClick={onDone} disabled={!saved} className="btn btn-primary mt-4">
        Done
      </button>
    </div>
  );
}
