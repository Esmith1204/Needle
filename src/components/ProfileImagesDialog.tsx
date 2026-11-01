import { useEffect, useRef, useState, type ChangeEvent, type SyntheticEvent } from "react";
import { useCurrentUser, useSession } from "../context/SessionContext";
import { setProfileImage, uploadProfileImage } from "../lib/api";
import { PROFILE_FILE_MAX_BYTES } from "../lib/format";
import type { ProfileImageKind } from "../types";
import { Avatar } from "./Avatar";
import { UploadIcon } from "./Icons";
import { ImageCropper } from "./ImageCropper";
import { ProfileImage } from "./ProfileImage";

/** Changes a profile picture and banner. A new image is cropped and confirmed first; "Done" only closes this. */
export function ProfileImagesDialog({ onClose }: { onClose: () => void }) {
  const user = useCurrentUser();
  const { refreshProfile } = useSession();
  const dialog = useRef<HTMLDialogElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const uploadKind = useRef<ProfileImageKind>("avatar");
  const [cropping, setCropping] = useState<{ kind: ProfileImageKind; file: File } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Closing it on cleanup would fire onClose, and StrictMode's extra cleanup would then dismiss it on arrival.
  useEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal();
  }, []);

  const run = async (change: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await change();
      await refreshProfile();
      setCropping(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
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

  // Escape backs out of cropping rather than closing everything, and waits for a save in progress.
  const onEscape = (e: SyntheticEvent) => {
    if (busy) {
      e.preventDefault();
    } else if (cropping) {
      e.preventDefault();
      setCropping(null);
      setError(null);
    }
  };

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      onCancel={onEscape}
      aria-labelledby="profile-images-title"
      className="m-auto max-h-[calc(100dvh-2rem)] w-[34rem] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-2xl border border-rule bg-card p-0 text-ink backdrop:bg-black/60"
    >
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-line bg-card px-4 py-3">
        <h2 id="profile-images-title" className="text-lg font-extrabold leading-snug">
          {cropping ? `Crop your ${cropping.kind === "avatar" ? "picture" : "banner"}` : "Picture and banner"}
        </h2>
        {!cropping && (
          <button type="button" onClick={() => dialog.current?.close()} disabled={busy} className="btn btn-primary h-8 px-4 text-xs">
            Done
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="mx-4 mt-3 rounded-xl border border-danger/40 bg-paper px-4 py-2.5 text-xs text-danger">
          {error}
        </p>
      )}

      {cropping ? (
        <ImageCropper
          file={cropping.file}
          kind={cropping.kind}
          busy={busy}
          onCancel={() => {
            setCropping(null);
            setError(null);
          }}
          onConfirm={(crop) => void run(() => uploadProfileImage(user.id, cropping.kind, cropping.file, crop))}
          onUnreadable={() => {
            setCropping(null);
            setError("That file couldn't be read as an image.");
          }}
        />
      ) : (
        <div className="flex flex-col gap-5 p-4">
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
            {busy ? "Saving…" : "JPEG, PNG, WebP, or GIF. You'll crop it before it's saved, and GIFs keep their animation."}
          </p>
        </div>
      )}

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
