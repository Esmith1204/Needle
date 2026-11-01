import { usePreferences } from "../context/PreferencesContext";
import { useAsync } from "../hooks/useAsync";
import { findPreviewSource, type PreviewSource } from "../lib/albumSearch";
import type { Album } from "../types";

interface AlbumPreviewProps {
  album: Album;
  /** Show nothing, rather than a message, when no player can be found. */
  quiet?: boolean;
  className?: string;
}

/** A player for an album or single, hosted by Deezer or Apple Music. Anyone can hear previews without an account. */
export function AlbumPreview({ album, quiet, className = "" }: AlbumPreviewProps) {
  const { data: source, loading, error } = useAsync(
    () => findPreviewSource(album),
    [album.title, album.artist, album.deezerId, album.itunesId],
  );

  if (loading && !source) {
    return quiet ? null : <p className={`text-xs text-muted ${className}`}>Finding a preview…</p>;
  }
  if (error || !source) {
    return quiet ? null : <p className={`text-xs text-muted ${className}`}>No preview found for this album.</p>;
  }
  return <Player source={source} title={album.title} className={className} />;
}

function Player({ source, title, className }: { source: PreviewSource; title: string; className: string }) {
  const { preferences } = usePreferences();
  const isDeezer = source.service === "deezer";
  // These ids come from database rows, so they only ever land in the address as digits.
  const id = source.id.replace(/\D/g, "");
  const src = isDeezer
    ? `https://widget.deezer.com/widget/${preferences.theme}/album/${id}?tracklist=true`
    : `https://embed.music.apple.com/us/album/${id}`;

  return (
    <div className={`relative overflow-hidden rounded-xl bg-field ${isDeezer ? "h-[300px]" : "h-[450px]"} ${className}`}>
      {/* The players take a moment to draw themselves, and cover this when they do. */}
      <p className="absolute inset-0 grid place-items-center text-xs text-muted">Loading the player…</p>
      <iframe
        title={`Preview of ${title}`}
        src={src}
        loading="lazy"
        allow="autoplay *; encrypted-media *; clipboard-write"
        sandbox="allow-forms allow-popups allow-same-origin allow-scripts allow-storage-access-by-user-activation allow-top-navigation-by-user-activation"
        // Against this app's dark color scheme, the browser would fill a loading player with white.
        style={{ colorScheme: "light" }}
        className="relative block h-full w-full border-0"
      />
    </div>
  );
}
