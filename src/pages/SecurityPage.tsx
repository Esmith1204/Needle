import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useSearchParams } from "react-router";
import { Field } from "../components/FormField";
import { GoogleIcon } from "../components/Icons";
import { PageHeader } from "../components/PageHeader";
import { TwoFactorCodeField } from "../components/TwoFactorCodeField";
import { useCurrentUser } from "../context/SessionContext";
import { useAsync } from "../hooks/useAsync";
import {
  changePassword,
  confirmPassword,
  connectGoogle,
  createRecoveryCode,
  deleteAccount,
  disconnectGoogle,
  finishTwoFactorSetup,
  getAccountSecurity,
  signInWithGoogle,
  startTwoFactorSetup,
  turnOffTwoFactor,
  verifyTwoFactorCode,
  wasJustAuthenticated,
} from "../lib/api";
import { MIN_PASSWORD } from "../lib/format";
import { clearOAuthError, oauthError } from "../lib/supabase";
import type { AccountSecurity, TotpEnrollment } from "../types";

const PAGE_PATH = "/settings/security";

export function SecurityPage() {
  const { data: security, error, reload } = useAsync(getAccountSecurity, []);
  const [searchParams, setSearchParams] = useSearchParams();
  // Coming back from Google, reopen the action it was confirming. Removed from the URL so a reload doesn't.
  const [resumeAction] = useState(() => searchParams.get("resume"));
  const [recovered] = useState(() => searchParams.has("recovered"));
  const [redirectError] = useState(oauthError);

  useEffect(() => {
    if (searchParams.size > 0) setSearchParams({}, { replace: true });
    return clearOAuthError;
  }, []);

  return (
    <div>
      <PageHeader title="Settings, security, and privacy" subtitle={security?.email ?? undefined} />
      {recovered && (
        <Alert className="mx-4 mt-4">
          Your recovery code worked, so two-factor is now off and your other devices are signed out. Turn two-factor
          back on below.
        </Alert>
      )}
      {redirectError && <Alert className="mx-4 mt-4">{redirectError}</Alert>}
      {error && <Alert className="mx-4 mt-4">{error.message}</Alert>}
      {security ? (
        <>
          <SectionHeading>Security</SectionHeading>
          <PasswordRow security={security} resumeAction={resumeAction} onChanged={reload} />
          <TwoFactorRow security={security} resumeAction={resumeAction} onChanged={reload} />
          {security.twoFactorEnabled && (
            <RecoveryCodeRow security={security} resumeAction={resumeAction} onChanged={reload} />
          )}

          <SectionHeading>Connected accounts</SectionHeading>
          <GoogleRow security={security} resumeAction={resumeAction} onChanged={reload} />

          <SectionHeading>Privacy</SectionHeading>
          <DeleteRow security={security} resumeAction={resumeAction} />
        </>
      ) : (
        !error && <div aria-busy="true" aria-label="Loading settings" className="m-4 h-40 animate-pulse rounded-xl bg-field" />
      )}
    </div>
  );
}

// ─── Password ───────────────────────────────────────────────────────────────

interface RowProps {
  security: AccountSecurity;
  resumeAction: string | null;
}

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

// ─── Connected accounts ─────────────────────────────────────────────────────

function GoogleRow({ security, resumeAction, onChanged }: RowProps & { onChanged: () => void }) {
  const { google, hasPassword } = security;
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const run = async (action: () => Promise<void>) => {
    setSubmitting(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  };

  const title = (
    <span className="flex items-center gap-2">
      <GoogleIcon size={16} />
      Google
    </span>
  );

  // Without a password, Google is the account's only way in.
  if (google && !hasPassword) {
    return (
      <Row
        title={title}
        description={`Connected${google.email ? ` as ${google.email}` : ""}. This is how you sign in, so it can't be disconnected.`}
      />
    );
  }

  return (
    <SecureAction
      id="google"
      title={title}
      description={
        google
          ? `Connected${google.email ? ` as ${google.email}` : ""}. You can sign in with Google.`
          : "Connect your Google account to sign in with it next time."
      }
      actionLabel={google ? "Disconnect" : "Connect"}
      security={security}
      resumeAction={resumeAction}
    >
      {(close) =>
        google ? (
          <div>
            <p className="text-sm">You&rsquo;ll no longer be able to sign in with this Google account.</p>
            {error && <Alert className="mt-3">{error}</Alert>}
            <button
              type="button"
              disabled={submitting}
              onClick={() =>
                void run(async () => {
                  await disconnectGoogle();
                  setSubmitting(false);
                  onChanged();
                  close();
                })
              }
              className="btn btn-danger mt-4"
            >
              {submitting ? "Disconnecting…" : "Disconnect Google"}
            </button>
          </div>
        ) : (
          <div>
            <p className="text-sm">
              Google will ask which account to connect, then send you back here.
              {security.twoFactorEnabled && " You'll enter your two-factor code again when you return."}
            </p>
            {error && <Alert className="mt-3">{error}</Alert>}
            <button
              type="button"
              disabled={submitting}
              onClick={() => void run(() => connectGoogle(PAGE_PATH))}
              className="btn btn-primary mt-4"
            >
              <GoogleIcon className="rounded-full bg-white p-0.5" />
              {submitting ? "Opening Google…" : "Continue to Google"}
            </button>
          </div>
        )
      }
    </SecureAction>
  );
}

// ─── Delete account ─────────────────────────────────────────────────────────

function DeleteRow({ security, resumeAction }: RowProps) {
  return (
    <SecureAction
      id="delete"
      title="Delete your profile"
      description="Permanently removes your account, ratings, reviews, and friends."
      actionLabel="Delete profile"
      danger
      security={security}
      resumeAction={resumeAction}
    >
      {() => <DeleteForm />}
    </SecureAction>
  );
}

function DeleteForm() {
  const { handle } = useCurrentUser();
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const matches = typed.trim().replace(/^@/, "").toLowerCase() === handle;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!matches) return;
    setSubmitting(true);
    setError(null);
    try {
      await deleteAccount();
      // Signing out sends them to the sign-in page.
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  };

  return (
    <form noValidate onSubmit={onSubmit}>
      <p className="text-sm">
        This can&rsquo;t be undone. Everything you&rsquo;ve posted disappears, and your handle becomes available to
        others.
      </p>
      <Field label={`Type @${handle} to confirm`} htmlFor="delete-confirm" className="mt-3">
        {(describedBy) => (
          <input
            id="delete-confirm"
            type="text"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            autoFocus
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            aria-describedby={describedBy}
            className="field"
          />
        )}
      </Field>
      {error && <Alert className="mt-3">{error}</Alert>}
      <button type="submit" disabled={!matches || submitting} className="btn btn-danger mt-4">
        {submitting ? "Deleting…" : "Permanently delete my profile"}
      </button>
    </form>
  );
}

// ─── Shared pieces ──────────────────────────────────────────────────────────

interface SecureActionProps {
  id: string;
  title: ReactNode;
  description: string;
  actionLabel: string;
  danger?: boolean;
  /** The form below proves who the user is itself, so it opens straight away. */
  confirmedByForm?: boolean;
  security: AccountSecurity;
  resumeAction: string | null;
  /** The form shown once the user has confirmed who they are. Receives a function that closes it. */
  children: (close: () => void) => ReactNode;
}

/** A settings row whose action only opens after the user proves it's really them. */
function SecureAction({ id, title, description, actionLabel, danger, confirmedByForm, security, resumeAction, children }: SecureActionProps) {
  const resuming = resumeAction === id;
  const [open, setOpen] = useState(resuming);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    if (!resuming) return;
    let cancelled = false;
    void wasJustAuthenticated().then((recent) => {
      if (recent && !cancelled) setConfirmed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [resuming]);

  const close = () => {
    setOpen(false);
    setConfirmed(false);
  };

  return (
    <Row
      title={title}
      description={description}
      action={
        <button
          type="button"
          aria-expanded={open}
          onClick={() => (open ? close() : setOpen(true))}
          className={`btn shrink-0 ${open ? "btn-outline" : danger ? "btn-outline border-danger text-danger hover:bg-danger/10" : "btn-outline"}`}
        >
          {open ? "Cancel" : actionLabel}
        </button>
      }
    >
      {open && (
        <div className="mt-3 rounded-xl border border-line bg-card p-4">
          {confirmed || confirmedByForm ? (
            children(close)
          ) : (
            <ConfirmIdentity security={security} actionId={id} onConfirmed={() => setConfirmed(true)} />
          )}
        </div>
      )}
    </Row>
  );
}

interface ConfirmIdentityProps {
  security: AccountSecurity;
  actionId: string;
  onConfirmed: () => void;
}

/**
 * "Confirm it's you", using the strongest thing the account has: an authenticator code,
 * then its password, then Google. 2FA accounts skip the password because checking one
 * resets the session to step one, which would lock the page behind the code screen.
 */
function ConfirmIdentity({ security, actionId, onConfirmed }: ConfirmIdentityProps) {
  const { email, hasPassword, twoFactorEnabled, google } = security;
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      if (twoFactorEnabled) await verifyTwoFactorCode(code);
      else await confirmPassword(email ?? "", password);
      onConfirmed();
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  };

  const onGoogle = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await signInWithGoogle(`${PAGE_PATH}?resume=${actionId}`, google?.email ?? email ?? undefined);
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  };

  const googleButton = (
    <button type="button" onClick={onGoogle} disabled={submitting} className="btn btn-outline">
      <GoogleIcon />
      Confirm with Google
    </button>
  );

  if (!twoFactorEnabled && !hasPassword) {
    return (
      <div>
        <p className="text-sm font-bold">Confirm it&rsquo;s you</p>
        <p className="mt-1 text-xs text-muted">Sign in with Google again, and you&rsquo;ll come right back here.</p>
        {error && <Alert className="mt-3">{error}</Alert>}
        <div className="mt-3">{googleButton}</div>
      </div>
    );
  }

  return (
    <form noValidate onSubmit={onSubmit}>
      <p className="text-sm font-bold">Confirm it&rsquo;s you</p>
      {twoFactorEnabled ? (
        <>
          <p className="mt-1 text-xs text-muted">Enter the code from your authenticator app to continue.</p>
          <TwoFactorCodeField id={`${actionId}-code`} value={code} onChange={setCode} className="mt-3" autoFocus />
        </>
      ) : (
        <>
          <p className="mt-1 text-xs text-muted">Enter your current password to continue.</p>
          <Field label="Current password" htmlFor={`${actionId}-password`} className="mt-3">
            {(describedBy) => (
              <input
                id={`${actionId}-password`}
                type="password"
                autoComplete="current-password"
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-describedby={describedBy}
                className="field"
              />
            )}
          </Field>
        </>
      )}
      {error && <Alert className="mt-3">{error}</Alert>}
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={submitting || (twoFactorEnabled ? code.length !== 6 : !password)}
          className="btn btn-primary"
        >
          {submitting ? "Checking…" : "Continue"}
        </button>
        {!twoFactorEnabled && google && googleButton}
      </div>
    </form>
  );
}

function SectionHeading({ children }: { children: ReactNode }) {
  return <h2 className="border-b border-line px-4 pb-2 pt-5 text-xs font-extrabold uppercase tracking-wide text-muted">{children}</h2>;
}

interface RowLayoutProps {
  title: ReactNode;
  description: string;
  action?: ReactNode;
  children?: ReactNode;
}

function Row({ title, description, action, children }: RowLayoutProps) {
  return (
    <section className="border-b border-line px-4 py-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-sm font-bold">{title}</h3>
          <p className="mt-0.5 text-xs leading-relaxed text-muted">{description}</p>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Alert({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <p role="alert" className={`rounded-xl border border-danger/40 bg-card px-4 py-2.5 text-xs text-danger ${className}`}>
      {children}
    </p>
  );
}
