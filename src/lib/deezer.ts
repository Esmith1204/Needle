import type { AlbumSearchResult } from "../types";

// The public Deezer API (no key). It doesn't allow calls from other sites' pages, so they go
// through this site's own address: see the rewrite in vercel.json and the proxy in vite.config.ts.

const API_BASE = "/deezer-api";
const SEARCH_RESULT_COUNT = 15;
const ARTIST_ALBUM_COUNT = 50;

interface DeezerAlbum {
  id: number;
  title: string;
  cover_big?: string;
  record_type?: string;
  release_date?: string;
  fans?: number;
  artist?: DeezerArtist;
}

interface DeezerArtist {
  id: number;
  name: string;
}

async function get<T>(path: string, params: Record<string, string> = {}, signal?: AbortSignal): Promise<T> {
  const query = new URLSearchParams(params).toString();
  const res = await fetch(`${API_BASE}/${path}${query ? `?${query}` : ""}`, { signal });
  if (!res.ok) throw new Error(`Deezer request failed (${res.status})`);
  // Deezer reports errors, including rate limits, as a normal response.
  const body = (await res.json()) as T & { error?: { message?: string } };
  if (body.error) throw new Error(body.error.message ?? "Deezer request failed");
  return body;
}

function toResult(album: DeezerAlbum, artistName: string | null): AlbumSearchResult | null {
  if (!album.cover_big) return null;
  const type = album.record_type;
  return {
    id: `deezer-${album.id}`,
    title: album.title,
    artist: artistName,
    year: album.release_date ? Number(album.release_date.slice(0, 4)) : null,
    coverUrl: album.cover_big,
    deezerId: String(album.id),
    recordType: type === "single" || type === "ep" ? type : "album",
  };
}

export async function searchDeezer(term: string, signal?: AbortSignal): Promise<AlbumSearchResult[]> {
  const { data } = await get<{ data: DeezerAlbum[] }>("search/album", { q: term, limit: String(SEARCH_RESULT_COUNT) }, signal);
  return data.flatMap((album) => toResult(album, album.artist?.name ?? null) ?? []);
}

/** Search results leave out the release date, so this fetches it once an album is chosen. */
export async function deezerAlbumYear(albumId: string, signal?: AbortSignal): Promise<number | null> {
  const { release_date: date } = await get<DeezerAlbum>(`album/${albumId}`, {}, signal);
  return date ? Number(date.slice(0, 4)) : null;
}

export async function deezerArtistOfAlbum(albumId: string): Promise<DeezerArtist | null> {
  const { artist } = await get<DeezerAlbum>(`album/${albumId}`);
  return artist ?? null;
}

export async function searchDeezerArtists(name: string): Promise<DeezerArtist[]> {
  const { data } = await get<{ data: DeezerArtist[] }>("search/artist", { q: name, limit: "5" });
  return data;
}

export async function relatedDeezerArtists(artistId: number, limit: number): Promise<DeezerArtist[]> {
  const { data } = await get<{ data: DeezerArtist[] }>(`artist/${artistId}/related`, { limit: String(limit) });
  return data;
}

/** An artist's full-length albums, most popular on Deezer first. */
export async function deezerArtistAlbums(artist: DeezerArtist): Promise<AlbumSearchResult[]> {
  const { data } = await get<{ data: DeezerAlbum[] }>(`artist/${artist.id}/albums`, { limit: String(ARTIST_ALBUM_COUNT) });
  return data
    .filter((album) => album.record_type === "album")
    .sort((a, b) => (b.fans ?? 0) - (a.fans ?? 0))
    .flatMap((album) => toResult(album, artist.name) ?? []);
}
