import { useEffect, useRef, useState, type ChangeEvent, type SyntheticEvent } from "react";
import { useCurrentUser, useSession } from "../context/SessionContext";
import { setProfileImage, uploadProfileImage, type ImageSaveStage } from "../lib/api";
import { PROFILE_FILE_MAX_BYTES } from "../lib/format";
import type { ProfileImageKind } from "../types";
import { Avatar } from "./Avatar";
import { UploadIcon } from "./Icons";
import { ImageCropper } from "./ImageCropper";
import { ProfileDetailsForm } from "./ProfileDetailsForm";
import { ProfileImage } from "./ProfileImage";

const STAGE_LABELS: Record<ImageSaveStage, string> = {
  preparing: "Preparing…",
  uploading: "Uploading…",
  saving: "Saving…",
};

const DISCARD_PROMPT = "Discard the changes to your name, handle, and bio?";

interface EditProfileDialogProps {
  onClose: () => void;
  /** After anything on the profile is saved. */
  onChange: () => void;
  /** After the handle changes, since the profile now lives at a new address. */
  onHandleChange: (handle: string) => void;
}

/**
 * Changes a profile picture, banner, name, handle, and bio. A new image is cropped and confirmed
 * first, and saved then; the details save with their own button. "Done" only closes this.
 */
export function EditProfileDialog({ onClose, onChange, onHandleChange }: EditProfileDialogProps) {
  const user = useCurrentUser();
  const { refreshProfile } = useSession();
  const dialog = useRef<HTMLDialogElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const uploadKind = useRef<ProfileImageKind>("avatar");
  const [cropping, setCropping] = useState<{ kind: ProfileImageKind; file: File } | null>(null);
  const [stage, setStage] = useState<ImageSaveStage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detailsDirty, setDetailsDirty] = useState(false);
  const busy = stage !== null;

  // Closing it on cleanup would fire onClose, and StrictMode's extra cleanup would then dismiss it on arrival.
  useEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal();
  }, []);

  const run = async (change: () => Promise<void>) => {
    setStage("saving");
    setError(null);
    try {
      await change();
      // Saved either way; the profile page also hears about the change and reloads itself.
      await refreshProfile().catch(() => undefined);
      setCropping(null);
      onChange();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setStage(null);
    }
  };

  const chooseFile = (kind: ProfileImageKind) => {
    uploadKind.current = kind;
    fileInput.current?.click();
  };

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > PROFILE_FILE_MAX_BYTES) {
      setError("That file is over 25 MB. Choose a smaller one.");
      return;
    }
    setError(null);
    setCropping({ kind: uploadKind.current, file });
  };

  const remove = (kind: ProfileImageKind) => {
    void run(() => setProfileImage(user.id, kind, null));
  };

  const close = () => {
    if (detailsDirty && !window.confirm(DISCARD_PROMPT)) return;
    dialog.current?.close();
  };

  // Escape backs out of cropping rather than closing everything, and waits for a save in progress.
  const onEscape = (e: SyntheticEvent) => {
    if (busy) {
      e.preventDefault();
    } else if (cropping) {
      e.preventDefault();
      setCropping(null);
      setError(null);
    } else if (detailsDirty && !window.confirm(DISCARD_PROMPT)) {
      e.preventDefault();
    }
  };

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      onCancel={onEscape}
      aria-labelledby="edit-profile-title"
      className="m-auto max-h-[calc(100dvh-2rem)] w-[34rem] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-2xl border border-rule bg-card p-0 text-ink backdrop:bg-black/60"
    >
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-line bg-card px-4 py-3">
        <h2 id="edit-profile-title" className="text-lg font-extrabold leading-snug">
          {cropping ? `Crop your ${cropping.kind === "avatar" ? "picture" : "banner"}` : "Edit profile"}
        </h2>
        {!cropping && (
          <button type="button" onClick={close} disabled={busy} className="btn btn-primary h-8 px-4 text-xs">
            Done
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="mx-4 mt-3 rounded-xl border border-danger/40 bg-paper px-4 py-2.5 text-xs text-danger">
          {error}
        </p>
      )}

      {cropping && (
        <ImageCropper
          file={cropping.file}
          kind={cropping.kind}
          busy={busy}
          busyLabel={stage ? STAGE_LABELS[stage] : undefined}
          onCancel={() => {
            setCropping(null);
            setError(null);
          }}
          onConfirm={(crop, decoded) =>
            void run(() =>
              uploadProfileImage(user.id, cropping.kind, cropping.file, crop, { decoded, onStage: setStage }),
            )
          }
          onUnreadable={() => {
            setCropping(null);
            setError("That file couldn't be read as an image.");
          }}
        />
      )}

      {/* Hidden rather than removed while cropping, so details typed in below aren't lost. */}
      <div hidden={Boolean(cropping)} className="flex flex-col gap-5 p-4">
        <section aria-labelledby="picture-heading">
          <h3 id="picture-heading" className="text-sm font-bold">
            Profile picture
          </h3>
          <div className="mt-2 flex items-center gap-3">
            <Avatar profile={user} size={72} />
            <ImageActions
              busy={busy}
              hasImage={Boolean(user.avatarUrl)}
              onUpload={() => chooseFile("avatar")}
              onRemove={() => remove("avatar")}
            />
          </div>
        </section>

        <section aria-labelledby="banner-heading">
          <h3 id="banner-heading" className="text-sm font-bold">
            Banner
          </h3>
          <div className="mt-2 aspect-[3/1] overflow-hidden rounded-xl bg-brand">
            {user.bannerUrl && <ProfileImage src={user.bannerUrl} className="h-full w-full object-cover" />}
          </div>
          <div className="mt-2">
            <ImageActions
              busy={busy}
              hasImage={Boolean(user.bannerUrl)}
              onUpload={() => chooseFile("banner")}
              onRemove={() => remove("banner")}
            />
          </div>
        </section>

        <p className="text-xs text-muted" aria-live="polite">
          {busy
            ? "Saving…"
            : "JPEG, PNG, WebP, or GIF. You'll crop it before it's saved, and GIFs keep their animation."}
        </p>

        <div className="border-t border-line pt-5">
          <ProfileDetailsForm
            onDirtyChange={setDetailsDirty}
            onSaved={(handle) => {
              onChange();
              if (handle) onHandleChange(handle);
            }}
          />
        </div>
      </div>

      <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden onChange={onFile} />
    </dialog>
  );
}

interface ImageActionsProps {
  busy: boolean;
  hasImage: boolean;
  onUpload: () => void;
  onRemove: () => void;
}

function ImageActions({ busy, hasImage, onUpload, onRemove }: ImageActionsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={onUpload} disabled={busy} className="btn btn-outline h-8 px-3 text-xs">
        <UploadIcon size={14} />
        Upload image or GIF
      </button>
      {hasImage && (
        <button
          type="button"
          onClick={onRemove}
          disabled={busy}
          className="px-1 text-xs font-semibold text-muted underline underline-offset-2 hover:text-ink disabled:opacity-60"
        >
          Remove
        </button>
      )}
    </div>
  );
}
