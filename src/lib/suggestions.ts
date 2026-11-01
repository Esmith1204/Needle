import type { AlbumSearchResult, AlbumSuggestion, RatedAlbum } from "../types";
import { sameAlbumKey } from "./albumSearch";
import { listRatedAlbums } from "./api";
import { deezerArtistAlbums, deezerArtistOfAlbum, relatedDeezerArtists, searchDeezerArtists } from "./deezer";

// Suggests albums from what someone rated highly: for their favorite artists, Deezer's related
// artists, and each one's most popular album they haven't rated. Runs in the browser and is
// saved per device, because it takes dozens of requests and Deezer limits how fast they can come.

/** Where the rate-by-comparison flow draws the line for "loved it". */
const LOVED_RATING = 7;
const MAX_SEEDS = 5;
const RELATED_PER_SEED = 4;
const MAX_SUGGESTIONS = 10;
/** Artists to look up albums for. A few spare, since some have nothing new to suggest. */
const MAX_CANDIDATES = 14;
const SAME_ARTIST_PENALTY = 1;
/** How much further down Deezer's list of related artists counts against one, in rating points. */
const RELATED_POSITION_PENALTY = 0.5;
/** How much another favorite artist pointing to the same artist counts for, in rating points. */
const SHARED_BY_SEEDS_BONUS = 3;
/** Deezer allows about 10 requests a second, and each of these takes around half a second. */
const CONCURRENT_REQUESTS = 3;
const CACHE_HOURS = 24;
const IGNORED_ALBUMS = /\b(live|remix(es)?|rmx|karaoke|tribute|instrumentals?|greatest hits|best of)\b/i;

const normalizedName = (name: string) => name.trim().toLowerCase();

function pickSeeds(rated: RatedAlbum[]): RatedAlbum[] {
  const seenArtists = new Set<string>();
  return rated
    .filter((album) => album.rating >= LOVED_RATING && album.artist)
    .sort((a, b) => b.rating - a.rating || b.ratedAt.localeCompare(a.ratedAt))
    .filter((album) => {
      const artist = normalizedName(album.artist ?? "");
      if (seenArtists.has(artist)) return false;
      seenArtists.add(artist);
      return true;
    })
    .slice(0, MAX_SEEDS);
}

async function deezerArtistFor(seed: RatedAlbum) {
  if (seed.deezerId) return deezerArtistOfAlbum(seed.deezerId);
  const matches = await searchDeezerArtists(seed.artist ?? "");
  // Names have to match: a stranger with a similar name would make every suggestion wrong.
  return matches.find((artist) => normalizedName(artist.name) === normalizedName(seed.artist ?? "")) ?? null;
}

interface Candidate {
  artist: { id: number; name: string };
  score: number;
  because: string;
}

/** Like Promise.allSettled over `items`, with only `limit` running at once. */
async function settleInTurn<T, R>(items: T[], limit: number, work: (item: T) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = [];
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      try {
        results[index] = { status: "fulfilled", value: await work(items[index]) };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  };
  await Promise.all(Array.from({ length: limit }, worker));
  return results;
}

interface BuiltSuggestions {
  suggestions: AlbumSuggestion[];
  /** False when some requests failed, so the list may be short, and shouldn't be kept. */
  complete: boolean;
}

async function buildSuggestions(rated: RatedAlbum[], seeds: RatedAlbum[]): Promise<BuiltSuggestions> {
  const candidates = new Map<number, Candidate>();
  const seedResults = await settleInTurn(seeds, CONCURRENT_REQUESTS, async (seed) => {
    const artist = await deezerArtistFor(seed);
    if (!artist) return;
    const related = await relatedDeezerArtists(artist.id, RELATED_PER_SEED);
    related.forEach((person, position) => {
      const existing = candidates.get(person.id);
      if (existing) existing.score += SHARED_BY_SEEDS_BONUS;
      // The penalty lets each favorite's closest match come before another's distant one.
      else candidates.set(person.id, { artist: person, score: seed.rating - position * RELATED_POSITION_PENALTY, because: seed.title });
    });
    // Another album by the same artist is a fair suggestion too, just not ahead of new discoveries.
    if (!candidates.has(artist.id)) {
      candidates.set(artist.id, { artist, score: seed.rating - SAME_ARTIST_PENALTY, because: seed.title });
    }
  });

  const ratedKeys = new Set(rated.map((album) => sameAlbumKey(album.title, album.artist)));
  const ordered = [...candidates.values()].sort((a, b) => b.score - a.score).slice(0, MAX_CANDIDATES);
  const picks = await settleInTurn(ordered, CONCURRENT_REQUESTS, async (candidate) => {
    const albums = await deezerArtistAlbums(candidate.artist);
    const album = albums.find((a) => !IGNORED_ALBUMS.test(a.title) && !ratedKeys.has(sameAlbumKey(a.title, a.artist)));
    return album ? { album, because: candidate.because } : null;
  });

  const suggestions = picks.flatMap((pick) => (pick.status === "fulfilled" && pick.value ? [pick.value] : [])).slice(0, MAX_SUGGESTIONS);
  const failure = [...seedResults, ...picks].find((result) => result.status === "rejected");
  // Nothing to show because requests failed is an error, not "nothing to suggest".
  if (failure && suggestions.length === 0) throw failure.reason;
  return { suggestions, complete: !failure };
}

interface CachedSuggestions {
  seeds: string;
  savedAt: number;
  suggestions: AlbumSuggestion[];
}

const cacheKey = (userId: string) => `needle.suggestions.${userId}`;

function readCache(userId: string): CachedSuggestions | null {
  try {
    return JSON.parse(localStorage.getItem(cacheKey(userId)) ?? "null") as CachedSuggestions | null;
  } catch {
    return null;
  }
}

function writeCache(userId: string, entry: CachedSuggestions) {
  try {
    localStorage.setItem(cacheKey(userId), JSON.stringify(entry));
  } catch {
    // Storage blocked or full: suggestions just get worked out again next time.
  }
}

/** So that loading twice in a row doesn't spend Deezer's request limit twice. */
const inProgress = new Map<string, Promise<AlbumSuggestion[]>>();

export interface HomeSuggestions {
  /** Whether they've rated anything highly enough to base suggestions on. */
  hasFavorites: boolean;
  suggestions: AlbumSuggestion[];
}

export async function loadHomeSuggestions(userId: string): Promise<HomeSuggestions> {
  const rated = await listRatedAlbums(userId);
  const seeds = pickSeeds(rated);
  if (seeds.length === 0) return { hasFavorites: false, suggestions: [] };

  const seedsKey = seeds.map((seed) => sameAlbumKey(seed.title, seed.artist)).join(",");
  const ratedKeys = new Set(rated.map((album) => sameAlbumKey(album.title, album.artist)));
  // An album rated since the list was saved shouldn't still be suggested.
  const notYetRated = ({ album }: { album: AlbumSearchResult }) => !ratedKeys.has(sameAlbumKey(album.title, album.artist));

  const rebuild = () => {
    const key = `${userId}|${seedsKey}`;
    const running = inProgress.get(key);
    if (running) return running;
    const work = buildSuggestions(rated, seeds)
      .then(({ suggestions, complete }) => {
        if (complete) writeCache(userId, { seeds: seedsKey, savedAt: Date.now(), suggestions });
        return suggestions;
      })
      .finally(() => inProgress.delete(key));
    inProgress.set(key, work);
    return work;
  };

  const cached = readCache(userId);
  if (!cached) return { hasFavorites: true, suggestions: await rebuild() };

  // An out-of-date list still beats a wait: show it now, and have a new one ready for next time.
  const fresh = cached.seeds === seedsKey && Date.now() - cached.savedAt < CACHE_HOURS * 3_600_000;
  if (!fresh) void rebuild().catch(() => undefined);
  return { hasFavorites: true, suggestions: cached.suggestions.filter(notYetRated) };
}
