import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useLocation, useSearchParams } from "react-router";
import { useAsync } from "../hooks/useAsync";
import { confirmPassword, getAccountSecurity, signInWithGoogle, verifyTwoFactorCode, wasJustAuthenticated } from "../lib/api";
import { clearOAuthError, oauthError } from "../lib/supabase";
import type { AccountSecurity } from "../types";
import { Field } from "./FormField";
import { GoogleIcon } from "./Icons";
import { PageHeader } from "./PageHeader";
import { TwoFactorCodeField } from "./TwoFactorCodeField";

// What the Settings, Security, and Privacy pages share.

export interface RowProps {
  security: AccountSecurity;
  resumeAction: string | null;
}

interface SettingsPageShellProps {
  title: string;
  children: (page: RowProps & { onChanged: () => void }) => ReactNode;
}

/** Loads the account's sign-in details, and shows anything a redirect back to this page has to report. */
export function SettingsPageShell({ title, children }: SettingsPageShellProps) {
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
      <PageHeader title={title} subtitle={security?.email ?? undefined} />
      {recovered && (
        <Alert className="mx-4 mt-4">
          Your recovery code worked, so two-factor is now off and your other devices are signed out. Turn two-factor
          back on below.
        </Alert>
      )}
      {redirectError && <Alert className="mx-4 mt-4">{redirectError}</Alert>}
      {error && <Alert className="mx-4 mt-4">{error.message}</Alert>}
      {security
        ? children({ security, resumeAction, onChanged: reload })
        : !error && <div aria-busy="true" aria-label="Loading settings" className="m-4 h-40 animate-pulse rounded-xl bg-field" />}
    </div>
  );
}

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
export function SecureAction({ id, title, description, actionLabel, danger, confirmedByForm, security, resumeAction, children }: SecureActionProps) {
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
  const { pathname } = useLocation();
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
      await signInWithGoogle(`${pathname}?resume=${actionId}`, google?.email ?? email ?? undefined);
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

export function SectionHeading({ children }: { children: ReactNode }) {
  return <h2 className="border-b border-line px-4 pb-2 pt-5 text-xs font-extrabold uppercase tracking-wide text-muted">{children}</h2>;
}

interface RowLayoutProps {
  title: ReactNode;
  description: string;
  action?: ReactNode;
  children?: ReactNode;
}

export function Row({ title, description, action, children }: RowLayoutProps) {
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

export function Alert({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <p role="alert" className={`rounded-xl border border-danger/40 bg-card px-4 py-2.5 text-xs text-danger ${className}`}>
      {children}
    </p>
  );
}
