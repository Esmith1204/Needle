import { useState, type FormEvent } from "react";
import { Field } from "../components/FormField";
import { Alert, Row, SecureAction, SectionHeading, SettingsPageShell, type RowProps } from "../components/SettingsPieces";
import { useCurrentUser } from "../context/SessionContext";
import { deleteAccount } from "../lib/api";

export function PrivacyPage() {
  return (
    <SettingsPageShell title="Privacy">
      {({ security, resumeAction }) => (
        <>
          <SectionHeading>Who can see what</SectionHeading>
          <Row
            title="Followers and following"
            description="Only you can open these lists. Others see how many followers and people you follow, not who they are."
          />
          <Row
            title="Everything else on your profile"
            description="Anyone signed in to Needle can see your ratings, reviews, comments, reposts, likes, lists, picture, and banner."
          />

          <SectionHeading>Your data</SectionHeading>
          <DeleteRow security={security} resumeAction={resumeAction} />
        </>
      )}
    </SettingsPageShell>
  );
}

function DeleteRow({ security, resumeAction }: RowProps) {
  return (
    <SecureAction
      id="delete"
      title="Delete your profile"
      description="Permanently removes your account, ratings, reviews, comments, lists, and followers."
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
