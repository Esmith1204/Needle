import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { useCurrentUser } from "../context/SessionContext";
import { useAsync } from "../hooks/useAsync";
import { useRealtimeRefresh } from "../hooks/useRealtimeRefresh";
import { listFollowing, listTopAlbums, searchProfiles } from "../lib/api";
import { enter, useGSAP } from "../lib/motion";
import type { TopAlbum } from "../types";
import { AlbumCover, CoverDescription } from "./AlbumCover";
import { SearchIcon } from "./Icons";
import { PersonRow } from "./PersonRow";
import { ScoreBadge } from "./ScoreBadge";

const COMPACT_PEOPLE = 4;

/**
 * Search for people, people to follow, and popular albums. `compact` is the short
 * version shown in the right column; the /discover page shows the full lists.
 */
export function DiscoverPanel({ compact = false }: { compact?: boolean }) {
  const viewer = useCurrentUser();
  const root = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  // People followed from this list stay visible, so the row doesn't vanish on click.
  const [followedHere, setFollowedHere] = useState<string[]>([]);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  const results = useAsync(() => searchProfiles(debounced), [debounced]);
  const following = useAsync(() => listFollowing(viewer.id), [viewer.id]);
  const albums = useAsync(() => listTopAlbums(compact ? 5 : 10), [compact]);
  useRealtimeRefresh(["ratings", "profiles", "follows"], () => {
    results.reload();
    following.reload();
    albums.reload();
  });

  useGSAP(() => enter("[data-discover-section]", { stagger: 0.06 }), { scope: root });

  const searching = debounced !== "";
  const followingIds = new Set(following.data?.map((f) => f.id));
  const people = results.data
    ?.filter((p) => p.id !== viewer.id)
    .filter((p) => searching || !followingIds.has(p.id) || followedHere.includes(p.id));
  const shownPeople = compact ? people?.slice(0, COMPACT_PEOPLE) : people;
  const peopleError = results.error ?? following.error;

  return (
    <div ref={root} className="flex flex-col gap-3">
      <div data-discover-section className="relative">
        <label htmlFor="discover-search" className="sr-only">
          Search by name or handle
        </label>
        <SearchIcon size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
        <input
          id="discover-search"
          type="search"
          autoComplete="off"
          placeholder="Search people"
          value={query}
          onChange={(e) => setQuery(e.target.value.replace(/^@/, ""))}
          className="field rounded-full pl-9"
        />
      </div>

      <Section title={searching ? "People" : "People to follow"}>
        {peopleError ? (
          <Note danger>{peopleError.message}</Note>
        ) : !shownPeople || !following.data ? (
          <Note>Loading…</Note>
        ) : shownPeople.length === 0 ? (
          <Note>
            {searching
              ? `No one matches “${debounced}”.`
              : followingIds.size > 0
                ? "You're following everyone here so far."
                : "No one else has joined yet. Share the site to get things going!"}
          </Note>
        ) : (
          <ul>
            {shownPeople.map((person) => (
              <PersonRow
                key={person.id}
                person={person}
                viewerId={viewer.id}
                following={followingIds.has(person.id)}
                showBio={!compact}
                onChange={() => {
                  setFollowedHere((ids) => [...ids, person.id]);
                  following.reload();
                }}
              />
            ))}
          </ul>
        )}
        {compact && people && people.length > COMPACT_PEOPLE && (
          <Link to="/discover" className="block rounded-b-2xl px-4 py-2.5 text-sm font-bold text-accent hover:bg-tint/5">
            Show more
          </Link>
        )}
      </Section>

      {!searching && (
        <Section title="Popular albums">
          {albums.error ? (
            <Note danger>{albums.error.message}</Note>
          ) : !albums.data ? (
            <Note>Loading…</Note>
          ) : albums.data.length === 0 ? (
            <Note>Albums show up here once people start rating.</Note>
          ) : (
            <ol className="pb-1.5">
              {albums.data.map((entry) => (
                <AlbumRow key={`${entry.album.title}|${entry.album.artist}`} entry={entry} />
              ))}
            </ol>
          )}
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section data-discover-section className="rounded-2xl border border-line bg-card/70">
      <h2 className="px-4 pb-1.5 pt-3 text-[0.9375rem] font-extrabold">{title}</h2>
      {children}
    </section>
  );
}

function Note({ danger, children }: { danger?: boolean; children: ReactNode }) {
  return <p className={`px-4 pb-3 text-sm ${danger ? "text-danger" : "text-muted"}`}>{children}</p>;
}

function AlbumRow({ entry }: { entry: TopAlbum }) {
  const { album, averageRating, ratingCount } = entry;
  return (
    <li className="flex items-center gap-2.5 px-4 py-1.5">
      <AlbumCover src={album.coverUrl} title={album.title} className="size-10 shrink-0 rounded-md" />
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block truncate text-sm font-bold">{album.title}</span>
        <span className="block truncate text-xs text-muted">
          {album.artist ? `${album.artist} · ` : ""}
          {ratingCount} {ratingCount === 1 ? "rating" : "ratings"}
        </span>
        <CoverDescription album={album} />
      </span>
      <ScoreBadge rating={averageRating} size="sm" />
    </li>
  );
}
