import type { AlbumSearchResult } from "../types";

// Album search via the public iTunes Search API (no key, CORS-enabled).

const RESULT_COUNT = 15;

interface ItunesAlbum {
  collectionId: number;
  collectionName: string;
  artistName: string;
  releaseDate?: string;
  artworkUrl100?: string;
}

export async function searchItunes(term: string, signal?: AbortSignal): Promise<AlbumSearchResult[]> {
  const url = `https://itunes.apple.com/search?entity=album&limit=${RESULT_COUNT}&term=${encodeURIComponent(term)}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Album search failed (${res.status})`);

  const data = (await res.json()) as { results: ItunesAlbum[] };
  return data.results
    .filter((r) => r.artworkUrl100)
    .map((r) => {
      // iTunes writes the kind of release into the title: "Espresso - Single".
      const kind = / - (Single|EP)$/i.exec(r.collectionName)?.[1]?.toLowerCase();
      return {
        id: `itunes-${r.collectionId}`,
        title: kind ? r.collectionName.replace(/ - (Single|EP)$/i, "") : r.collectionName,
        artist: r.artistName,
        year: r.releaseDate ? Number(r.releaseDate.slice(0, 4)) : null,
        // The API returns 100px art; the same URL serves any size.
        coverUrl: r.artworkUrl100!.replace("100x100bb", "600x600bb"),
        itunesId: String(r.collectionId),
        recordType: kind === "single" || kind === "ep" ? kind : "album",
      };
    });
}
