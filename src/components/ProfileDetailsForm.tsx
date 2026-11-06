import { useEffect, useState, type FormEvent } from "react";
import { useCurrentUser, useSession } from "../context/SessionContext";
import { useAsync } from "../hooks/useAsync";
import { useHandleCheck } from "../hooks/useHandleCheck";
import { isHandleAvailable, listRecentHandleChanges, updateProfileDetails } from "../lib/api";
import { BIO_MAX_LENGTH, fullTimestamp, HANDLE_CHANGE_LIMIT, nextHandleChangeAt } from "../lib/format";
import { Field } from "./FormField";
import { HandleInput, ProfileNameInput } from "./ProfileFields";

interface ProfileDetailsFormProps {
  /** Whether there are changes that haven't been saved, so closing can ask first. */
  onDirtyChange: (dirty: boolean) => void;
  /** After saving. `handle` is the new one when it changed, since the profile's address changes with it. */
  onSaved: (handle: string | null) => void;
}

/** The signed-in user's name, handle, and bio. */
export function ProfileDetailsForm({ onDirtyChange, onSaved }: ProfileDetailsFormProps) {
  const user = useCurrentUser();
  const { refreshProfile } = useSession();
  const [displayName, setDisplayName] = useState(user.displayName);
  const [handle, setHandle] = useState(user.handle);
  const [bio, setBio] = useState(user.bio);
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recentChanges = useAsync(() => listRecentHandleChanges(user.id), [user.id]);

  const handleChanged = handle !== user.handle;
  // Your own handle counts as taken, so it's only looked up once it's different.
  const handleCheck = useHandleCheck(handleChanged ? handle : "");
  const nextChange = recentChanges.data ? nextHandleChangeAt(recentChanges.data) : null;
  const changesLeft = recentChanges.data ? Math.max(0, HANDLE_CHANGE_LIMIT - recentChanges.data.length) : null;
  const dirty = displayName.trim() !== user.displayName || bio.trim() !== user.bio || handleChanged;

  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  const nameError = displayName.trim() ? null : "Enter your name.";
  const handleError = !handleChanged
    ? null
    : nextChange
      ? `You can change your handle again at ${fullTimestamp(nextChange.toISOString())}.`
      : handleCheck.status === "empty"
        ? "Pick a handle."
        : handleCheck.status === "invalid" || handleCheck.status === "taken"
          ? handleCheck.message
          : null;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setAttempted(true);
    setSaved(false);
    if (!dirty || nameError || handleError) return;
    setSaving(true);
    setError(null);
    try {
      // Asked again now, since someone may have taken it while this was open. The database has the final say.
      if (handleChanged && !(await isHandleAvailable(handle))) {
        throw new Error(`@${handle} is taken. Try another one.`);
      }
      await updateProfileDetails(user.id, { displayName, bio, handle: handleChanged ? handle : undefined });
      const refreshed = refreshProfile().catch(() => undefined);
      if (handleChanged) {
        // The old address is gone, so this goes first, before the page notices.
        onSaved(handle);
        return;
      }
      await refreshed;
      setDisplayName((name) => name.trim());
      setBio((text) => text.trim());
      setAttempted(false);
      setSaved(true);
      onSaved(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleNote =
    nextChange && !handleChanged
      ? `You've changed your handle ${HANDLE_CHANGE_LIMIT} times in the last two days. You can change it again at ${fullTimestamp(nextChange.toISOString())}.`
      : changesLeft === null
        ? `Handles can change ${HANDLE_CHANGE_LIMIT} times every two days.`
        : `Handles can change ${HANDLE_CHANGE_LIMIT} times every two days. You have ${changesLeft} ${changesLeft === 1 ? "change" : "changes"} left.`;

  return (
    <form noValidate onSubmit={onSubmit} aria-labelledby="details-heading" className="flex flex-col gap-4">
      <h3 id="details-heading" className="text-sm font-bold">
        Name, handle, and bio
      </h3>

      <ProfileNameInput
        value={displayName}
        onChange={(value) => {
          setDisplayName(value);
          setSaved(false);
        }}
        error={attempted ? nameError : null}
      />

      <div>
        <HandleInput
          value={handle}
          onChange={(value) => {
            setHandle(value);
            setSaved(false);
          }}
          check={handleCheck}
          error={attempted || (handleChanged && nextChange) ? handleError : null}
          disabled={Boolean(nextChange) && !handleChanged}
        />
        <p className="mt-1 text-xs text-muted">
          {handleNote}
          {handleChanged && " Links to your old handle will stop working."}
        </p>
      </div>

      <Field label="Bio (optional)" htmlFor="bio">
        {(describedBy) => (
          <>
            <textarea
              id="bio"
              rows={3}
              maxLength={BIO_MAX_LENGTH}
              placeholder="What do you listen to?"
              value={bio}
              onChange={(e) => {
                setBio(e.target.value);
                setSaved(false);
              }}
              aria-describedby={describedBy}
              className="field h-auto resize-y py-2.5 leading-relaxed"
            />
            <p className="mt-1 text-right text-xs tabular-nums text-muted" aria-live="polite">
              {bio.length}/{BIO_MAX_LENGTH}
            </p>
          </>
        )}
      </Field>

      {error && (
        <p role="alert" className="rounded-xl border border-danger/40 bg-paper px-4 py-2.5 text-xs text-danger">
          {error}
        </p>
      )}

      <div className="flex items-center justify-end gap-3">
        <span className="text-xs text-muted" aria-live="polite">
          {saved && "Saved."}
        </span>
        <button type="submit" disabled={saving || !dirty} className="btn btn-primary">
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}
