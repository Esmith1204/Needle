import { useEffect, useId, useState, type KeyboardEvent } from "react";
import { searchAlbums, withReleaseYear } from "../lib/albumSearch";
import type { AlbumSearchResult } from "../types";

interface AlbumSearchFieldProps {
  query: string;
  selected: AlbumSearchResult | null;
  onQueryChange: (query: string) => void;
  onSelect: (album: AlbumSearchResult) => void;
  invalid?: boolean;
  describedBy?: string;
}

/** Album name input with an autocomplete list of matching albums and their covers. */
export function AlbumSearchField({
  query,
  selected,
  onQueryChange,
  onSelect,
  invalid,
  describedBy,
}: AlbumSearchFieldProps) {
  const listId = useId();
  const [results, setResults] = useState<AlbumSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");

  useEffect(() => {
    if (selected || query.trim().length < 2) {
      setResults([]);
      setStatus("idle");
      return;
    }
    const controller = new AbortController();
    setStatus("loading");
    const timer = window.setTimeout(() => {
      searchAlbums(query, controller.signal).then(
        (found) => {
          setResults(found);
          setActive(-1);
          setStatus("idle");
        },
        (err: unknown) => {
          if ((err as Error).name !== "AbortError") setStatus("error");
        },
      );
    }, 300);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query, selected]);

  const choose = (album: AlbumSearchResult) => {
    setOpen(false);
    setActive(-1);
    void withReleaseYear(album).then(onSelect);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i <= 0 ? results.length - 1 : i - 1));
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      choose(results[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const showList = open && !selected && query.trim().length >= 2;

  return (
    <div className="relative">
      <input
        id="album"
        type="text"
        role="combobox"
        autoComplete="off"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        placeholder="Ex.  In rainbows"
        value={query}
        onChange={(e) => {
          onQueryChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        className="field"
      />

      {showList && (
        <ul
          id={listId}
          role="listbox"
          // Keep focus in the input while pressing a result, so the list doesn't
          // close (on blur) before the click that selects the album lands.
          onMouseDown={(e) => e.preventDefault()}
          className="absolute inset-x-0 top-full z-30 mt-1 max-h-80 overflow-y-auto rounded-xl border border-rule bg-card shadow-[0_12px_32px_-12px_rgb(0_0_0/0.7)]"
        >
          {status === "loading" && results.length === 0 && (
            <li className="px-4 py-3 text-sm text-muted">Searching…</li>
          )}
          {status === "error" && (
            <li className="px-4 py-3 text-sm text-muted">Search is unavailable. You can upload a cover instead.</li>
          )}
          {status === "idle" && results.length === 0 && (
            <li className="px-4 py-3 text-sm text-muted">No albums found. Try the artist name too.</li>
          )}
          {results.map((album, i) => (
            <li
              key={album.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(album)}
              className={`flex cursor-pointer items-center gap-3 px-3 py-2 ${i === active ? "bg-field" : ""}`}
            >
              <img src={album.coverUrl} alt="" className="size-10 shrink-0 rounded-md object-cover" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold">{album.title}</span>
                <span className="block truncate text-xs text-muted">
                  {album.artist}
                  {album.year ? ` · ${album.year}` : ""}
                  {album.recordType === "single" ? " · Single" : album.recordType === "ep" ? " · EP" : ""}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
