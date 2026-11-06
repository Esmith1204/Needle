import type { Album, AlbumSearchResult } from "../types";
import { deezerAlbumYear, searchDeezer } from "./deezer";
import { searchItunes } from "./itunes";

// Searches iTunes and Deezer together. Each is missing albums the other has, and each
// limits requests on its own schedule, so one failing still leaves results from the other.

const MAX_RESULTS = 20;
const YEAR_LOOKUP_TIMEOUT_MS = 2000;

const normalize = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/&/g, "and")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

/** iTunes puts the kind of release in its titles. Ratings saved before the app removed it still have it. */
const KIND_SUFFIX = /\s+-\s+(?:single|ep)$/i;

const withoutKind = (title: string) => title.replace(KIND_SUFFIX, "");

/** A title with the edition and the kind of release taken off: "Espresso - Single" and "Espresso (Deluxe)" are both "espresso". */
function releaseTitleKey(title: string): string {
  const base = withoutKind(title);
  return normalize(base.replace(/\([^)]*\)|\[[^\]]*\]/g, " ")) || normalize(base);
}

/** Two listings with this in common are the same release, even if one says "(Deluxe)" and the other doesn't. */
export function sameAlbumKey(title: string, artist: string | null): string {
  return `${releaseTitleKey(title)}|${normalize(artist ?? "")}`;
}

// Separators between credited artists. The words need spaces around them, so "Lil Nas X" stays whole.
const ARTIST_SEPARATOR = /\s*(?:,|&|\+)\s*|\s+(?:x|feat\.?|ft\.?|featuring|with)\s+/i;

/**
 * Whether two credits share an artist. A single is often credited differently on each
 * service: "Lady Gaga & Bruno Mars" on iTunes is "Lady Gaga" on Deezer.
 */
function sameArtists(a: string | null, b: string | null): boolean {
  if (normalize(a ?? "") === normalize(b ?? "")) return true;
  const names = (credit: string | null) => (credit ?? "").split(ARTIST_SEPARATOR).map(normalize).filter(Boolean);
  const first = new Set(names(a));
  return names(b).some((name) => first.has(name));
}

/** Whether a search result is the album a rating was saved with. */
function isSameRelease(result: Album, album: Album): boolean {
  return releaseTitleKey(result.title) === releaseTitleKey(album.title) && sameArtists(result.artist, album.artist);
}

/**
 * Joins an album that only iTunes listed with the same one that only Deezer did, when the two
 * credit it differently. Without this, picking the iTunes listing saves no Deezer id.
 */
function joinDifferentlyCredited(results: AlbumSearchResult[]): AlbumSearchResult[] {
  const twins = new Map<AlbumSearchResult, AlbumSearchResult>();
  const joined = new Set<AlbumSearchResult>();
  for (const result of results) {
    if (!result.itunesId || result.deezerId) continue;
    const twin = results.find(
      (other) =>
        other.deezerId &&
        !other.itunesId &&
        !joined.has(other) &&
        normalize(other.title) === normalize(result.title) &&
        sameArtists(other.artist, result.artist),
    );
    if (twin) {
      twins.set(result, twin);
      joined.add(twin);
    }
  }
  // The iTunes listing is the one kept, because it names every main artist.
  return results.flatMap((result) => {
    if (joined.has(result)) return [];
    const twin = twins.get(result);
    return [twin ? { ...result, deezerId: twin.deezerId, year: result.year ?? twin.year } : result];
  });
}

function relevance(result: AlbumSearchResult, query: string): number {
  const title = normalize(result.title);
  const artist = normalize(result.artist ?? "");
  const onBothServices = result.deezerId && result.itunesId ? 5 : 0;
  const words = query.split(" ");
  const score =
    title === query
      ? 100
      : `${artist} ${title}` === query || `${title} ${artist}` === query
        ? 90
        : title.startsWith(query)
          ? 70
          : words.every((word) => `${title} ${artist}`.includes(word))
            ? 50
            : 0;
  return score + onBothServices;
}

export async function searchAlbums(term: string, signal?: AbortSignal): Promise<AlbumSearchResult[]> {
  const query = term.trim();
  if (query.length < 2) return [];

  const [deezer, itunes] = await Promise.allSettled([searchDeezer(query, signal), searchItunes(query, signal)]);
  if (deezer.status === "rejected" && itunes.status === "rejected") throw deezer.reason;

  const fromDeezer = deezer.status === "fulfilled" ? deezer.value : [];
  const fromItunes = itunes.status === "fulfilled" ? itunes.value : [];

  // Listings from the two take turns, so that neither service's order decides the other's place.
  const merged = new Map<string, AlbumSearchResult>();
  for (let i = 0; i < Math.max(fromDeezer.length, fromItunes.length); i++) {
    for (const result of [fromDeezer[i], fromItunes[i]]) {
      if (!result) continue;
      // Editions stay separate here: someone searching may mean that specific one.
      const key = `${normalize(result.title)}|${normalize(result.artist ?? "")}`;
      const existing = merged.get(key);
      merged.set(key, existing ? { ...existing, ...result, id: existing.id, coverUrl: existing.coverUrl, year: existing.year ?? result.year } : result);
    }
  }

  const normalizedQuery = normalize(query);
  return joinDifferentlyCredited([...merged.values()])
    .map((result) => ({ result, score: relevance(result, normalizedQuery) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_RESULTS)
    .map(({ result }) => result);
}

/** Fills in the year of an album that only Deezer's search found. Without it, the album is still usable. */
export async function withReleaseYear(album: AlbumSearchResult): Promise<AlbumSearchResult> {
  if (album.year !== null || !album.deezerId) return album;
  try {
    return { ...album, year: await deezerAlbumYear(album.deezerId, AbortSignal.timeout(YEAR_LOOKUP_TIMEOUT_MS)) };
  } catch {
    return album;
  }
}

export interface PreviewSource {
  service: "deezer" | "itunes";
  id: string;
}

const IDS_PATTERN = /^[0-9]+$/;
const lookups = new Map<string, PreviewSource | null>();

/** Whether there's enough known about an album to look for a player. A title alone could match the wrong one. */
export function canPreview(album: Album): boolean {
  return Boolean(album.deezerId || album.itunesId || album.artist);
}

/**
 * Finds a player: Deezer's when the rating saved its id, or when it can be found by the album's
 * title and artist, otherwise Apple Music's. Ratings saved before the ids were (or from an
 * iTunes-only listing) are looked up this way.
 */
export async function findPreviewSource(album: Album, signal?: AbortSignal): Promise<PreviewSource | null> {
  if (album.deezerId && IDS_PATTERN.test(album.deezerId)) return { service: "deezer", id: album.deezerId };
  const saved: PreviewSource | null =
    album.itunesId && IDS_PATTERN.test(album.itunesId) ? { service: "itunes", id: album.itunesId } : null;
  if (!album.artist) return saved;

  const key = `${sameAlbumKey(album.title, album.artist)}|${saved?.id ?? ""}`;
  const known = lookups.get(key);
  if (known !== undefined) return known;

  let results: AlbumSearchResult[];
  try {
    // Searching with " - Single" still in the title finds the wrong album on Deezer.
    results = await searchAlbums(`${album.artist} ${withoutKind(album.title)}`, signal);
  } catch (err) {
    if (saved) return saved;
    throw err;
  }
  const match = results.filter((result) => isSameRelease(result, album));
  const deezer = match.find((result) => result.deezerId);
  const itunes = match.find((result) => result.itunesId);
  const source: PreviewSource | null = deezer?.deezerId
    ? { service: "deezer", id: deezer.deezerId }
    : (saved ?? (itunes?.itunesId ? { service: "itunes", id: itunes.itunesId } : null));
  lookups.set(key, source);
  return source;
}
