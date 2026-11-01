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

/** Two listings with this in common are the same release, even if one says "(Deluxe)" and the other doesn't. */
export function sameAlbumKey(title: string, artist: string | null): string {
  const withoutEdition = title.replace(/\([^)]*\)|\[[^\]]*\]/g, " ");
  return `${normalize(withoutEdition) || normalize(title)}|${normalize(artist ?? "")}`;
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
  return [...merged.values()]
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

/** Finds a player: from the ids saved with a rating, or for an older rating, by its exact title and artist. */
export async function findPreviewSource(album: Album, signal?: AbortSignal): Promise<PreviewSource | null> {
  if (album.deezerId && IDS_PATTERN.test(album.deezerId)) return { service: "deezer", id: album.deezerId };
  if (album.itunesId && IDS_PATTERN.test(album.itunesId)) return { service: "itunes", id: album.itunesId };
  if (!album.artist) return null;

  const key = sameAlbumKey(album.title, album.artist);
  const known = lookups.get(key);
  if (known !== undefined) return known;

  const results = await searchAlbums(`${album.artist} ${album.title}`, signal);
  const match = results.filter((result) => sameAlbumKey(result.title, result.artist) === key);
  const deezer = match.find((result) => result.deezerId);
  const itunes = match.find((result) => result.itunesId);
  const source: PreviewSource | null = deezer?.deezerId
    ? { service: "deezer", id: deezer.deezerId }
    : itunes?.itunesId
      ? { service: "itunes", id: itunes.itunesId }
      : null;
  lookups.set(key, source);
  return source;
}
