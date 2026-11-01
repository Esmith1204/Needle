import { useState } from "react";
import { GoogleIcon } from "../components/Icons";
import { Alert, Row, SecureAction, SectionHeading, SettingsPageShell, type RowProps } from "../components/SettingsPieces";
import { useCurrentUser } from "../context/SessionContext";
import { connectGoogle, disconnectGoogle } from "../lib/api";

const PAGE_PATH = "/settings";

export function SettingsPage() {
  const user = useCurrentUser();
  return (
    <SettingsPageShell title="Settings">
      {({ security, resumeAction, onChanged }) => (
        <>
          <SectionHeading>Your account</SectionHeading>
          <Row title="Email" description={security.email ?? "None"} />
          <Row title="Handle" description={`@${user.handle}`} />

          <SectionHeading>Connected accounts</SectionHeading>
          <GoogleRow security={security} resumeAction={resumeAction} onChanged={onChanged} />
        </>
      )}
    </SettingsPageShell>
  );
}

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
