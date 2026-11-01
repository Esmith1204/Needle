import { useState } from "react";
import { usePreferences } from "../context/PreferencesContext";
import type { Album } from "../types";

interface AlbumCoverProps {
  src: string | null | undefined;
  title: string;
  className?: string;
}

/** Square album art; falls back to the vinyl placeholder from the mockups. */
export function AlbumCover({ src, title, className = "" }: AlbumCoverProps) {
  const [failed, setFailed] = useState(false);
  const showImage = src && !failed;

  return (
    <div className={`relative aspect-square overflow-hidden bg-placeholder ${className}`}>
      {showImage ? (
        <img
          src={src}
          alt={`Cover of ${title}`}
          loading="lazy"
          onError={() => setFailed(true)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <VinylPlaceholder title={title} />
      )}
    </div>
  );
}

/** The cover's description as visible text, for people who turned that on in Accessibility options. */
export function CoverDescription({ album }: { album: Pick<Album, "title" | "artist" | "coverUrl"> }) {
  const { preferences } = usePreferences();
  if (!preferences.imageDescriptions) return null;
  const byline = album.artist ? ` by ${album.artist}` : "";
  return (
    <span className="mt-0.5 block text-xs text-muted">
      {album.coverUrl ? `Image: cover of ${album.title}${byline}` : `Image: no cover for ${album.title}${byline}`}
    </span>
  );
}

function VinylPlaceholder({ title }: { title: string }) {
  return (
    <svg viewBox="0 0 100 100" role="img" aria-label={`No cover for ${title}`} className="absolute inset-0 h-full w-full">
      <circle cx="50" cy="50" r="35" fill="none" stroke="#6d7294" strokeWidth="0.5" />
      <circle cx="50" cy="50" r="25" fill="none" stroke="#585d7c" strokeWidth="0.4" />
      <circle cx="50" cy="50" r="7" fill="#6d7294" />
    </svg>
  );
}
