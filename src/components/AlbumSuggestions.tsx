import { useState } from "react";
import { Link } from "react-router";
import { useAsync } from "../hooks/useAsync";
import { loadHomeSuggestions } from "../lib/suggestions";
import type { AlbumSuggestion } from "../types";
import { AlbumCover, CoverDescription } from "./AlbumCover";
import { AlbumPreview } from "./AlbumPreview";
import { PlayIcon } from "./Icons";

/** "Suggested for you" on the home page: albums similar to what the viewer has rated highly. */
export function AlbumSuggestions({ userId }: { userId: string }) {
  const { data, loading, error, reload } = useAsync(() => loadHomeSuggestions(userId), [userId]);
  const [previewing, setPreviewing] = useState<string | null>(null);

  if (error) {
    return (
      <section aria-label="Suggested for you" className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 text-sm text-muted">
        <p>Suggestions aren't available right now.</p>
        <button type="button" onClick={reload} disabled={loading} className="shrink-0 font-semibold hover:text-ink">
          Try again
        </button>
      </section>
    );
  }
  if (!data) {
    return (
      <div aria-busy="true" aria-label="Loading suggestions" className="flex animate-pulse gap-3 overflow-hidden border-b border-line p-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="size-32 shrink-0 rounded-lg bg-field" />
        ))}
      </div>
    );
  }
  if (!data.hasFavorites) {
    return (
      <section aria-label="Suggested for you" className="border-b border-line px-4 py-3 text-sm text-muted">
        Rate an album you love, 7.0 or higher, and similar albums will show up here.
      </section>
    );
  }
  if (data.suggestions.length === 0) return null;

  const playing = data.suggestions.find(({ album }) => album.id === previewing);

  return (
    <section aria-labelledby="suggestions-heading" className="border-b border-line py-3">
      <div className="px-4">
        <h2 id="suggestions-heading" className="text-[0.9375rem] font-extrabold">
          Suggested for you
        </h2>
        <p className="text-xs text-muted">Similar to albums you rated highly</p>
      </div>
      <ul className="mt-2 flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:thin]">
        {data.suggestions.map((suggestion) => (
          <SuggestionCard
            key={suggestion.album.id}
            suggestion={suggestion}
            previewing={previewing === suggestion.album.id}
            onTogglePreview={() => setPreviewing((id) => (id === suggestion.album.id ? null : suggestion.album.id))}
          />
        ))}
      </ul>
      {playing && <AlbumPreview key={playing.album.id} album={playing.album} className="mx-4 mt-3" />}
    </section>
  );
}

interface SuggestionCardProps {
  suggestion: AlbumSuggestion;
  previewing: boolean;
  onTogglePreview: () => void;
}

function SuggestionCard({ suggestion: { album, because }, previewing, onTogglePreview }: SuggestionCardProps) {
  return (
    <li className="flex w-36 shrink-0 flex-col">
      <AlbumCover src={album.coverUrl} title={album.title} className="rounded-lg" />
      <p className="mt-1.5 truncate text-sm font-bold leading-tight" title={album.title}>
        {album.title}
      </p>
      <p className="truncate text-xs text-muted">{album.artist}</p>
      <p className="mt-0.5 line-clamp-2 text-xs leading-tight text-muted" title={`Because you rated ${because}`}>
        Because you rated {because}
      </p>
      <CoverDescription album={album} />
      <div className="mt-auto flex gap-1.5 pt-1.5">
        <Link to="/rate" state={{ album }} aria-label={`Rate ${album.title}`} className="btn btn-primary h-7 flex-1 px-2 text-xs">
          Rate
        </Link>
        <button
          type="button"
          aria-label={`${previewing ? "Hide preview of" : "Preview"} ${album.title}`}
          aria-pressed={previewing}
          onClick={onTogglePreview}
          className={`btn btn-outline size-7 shrink-0 p-0 ${previewing ? "text-accent" : ""}`}
        >
          <PlayIcon size={12} />
        </button>
      </div>
    </li>
  );
}
