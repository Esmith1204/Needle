import { Link } from "react-router";
import { useAsync } from "../hooks/useAsync";
import { useRealtimeRefresh } from "../hooks/useRealtimeRefresh";
import { listAlbumLists } from "../lib/api";
import type { AlbumList } from "../types";
import { AlbumCover } from "./AlbumCover";

const PREVIEW_COVERS = 4;

/** A profile's album lists. Shows nothing for a profile that has none, and nothing while loading. */
export function ProfileLists({ userId }: { userId: string }) {
  const { data: lists, error, reload } = useAsync(() => listAlbumLists(userId), [userId]);
  useRealtimeRefresh(["album_lists", "album_list_items"], reload);

  if (error) return <p className="border-b border-line px-4 py-3 text-sm text-danger">{error.message}</p>;
  if (!lists || lists.length === 0) return null;

  return (
    <section aria-labelledby="album-lists" className="border-b border-line p-4">
      <h2 id="album-lists" className="text-sm font-extrabold">
        Lists <span className="ml-1 font-semibold text-muted">{lists.length}</span>
      </h2>
      <ul className="mt-2 grid gap-2 sm:grid-cols-2">
        {lists.map((list) => (
          <li key={list.id}>
            <ListTile list={list} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function ListTile({ list }: { list: AlbumList }) {
  const count = list.albums.length;
  return (
    <Link
      to={`/lists/${list.id}`}
      className="group flex items-center gap-3 rounded-xl border border-line bg-tint/[0.03] p-2 transition-colors hover:bg-tint/[0.06]"
    >
      <div aria-hidden="true" className="grid size-14 shrink-0 grid-cols-2 gap-px overflow-hidden rounded-lg bg-placeholder">
        {list.albums.slice(0, PREVIEW_COVERS).map((album) => (
          <AlbumCover key={`${album.title}|${album.artist}`} src={album.coverUrl} title={album.title} />
        ))}
      </div>
      <span className="min-w-0 leading-tight">
        <span className="block truncate text-sm font-bold group-hover:underline">{list.title}</span>
        <span className="block text-xs text-muted">
          {count} {count === 1 ? "album" : "albums"}
        </span>
      </span>
    </Link>
  );
}
