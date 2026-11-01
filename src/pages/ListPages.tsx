import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { AlbumCover, CoverDescription } from "../components/AlbumCover";
import { AlbumSearchField } from "../components/AlbumSearchField";
import { Avatar } from "../components/Avatar";
import { Field } from "../components/FormField";
import { TrashIcon } from "../components/Icons";
import { PageHeader } from "../components/PageHeader";
import { useCurrentUser } from "../context/SessionContext";
import { useAsync } from "../hooks/useAsync";
import { useRealtimeRefresh } from "../hooks/useRealtimeRefresh";
import { deleteAlbumList, getAlbumList, saveAlbumList } from "../lib/api";
import { LIST_DESCRIPTION_MAX_LENGTH, LIST_TITLE_MAX_LENGTH } from "../lib/format";
import type { Album, AlbumListWithOwner } from "../types";

const sameAlbum = (a: Album, b: Album) =>
  a.title.toLowerCase() === b.title.toLowerCase() && (a.artist ?? "").toLowerCase() === (b.artist ?? "").toLowerCase();

/** /lists/:id — keyed by id so state resets when moving between lists. */
export function ListRoute() {
  const { id = "" } = useParams();
  return <ListPage key={id} id={id} />;
}

function ListPage({ id }: { id: string }) {
  const viewer = useCurrentUser();
  const navigate = useNavigate();
  const { data: list, loading, error, reload } = useAsync(() => getAlbumList(id), [id]);
  useRealtimeRefresh(["album_lists", "album_list_items"], reload);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  if (error) return <Message title="This list didn't load." body={error.message} />;
  if (loading && list === undefined) return <ListSkeleton />;
  if (!list) return <Message title="This list isn't here." body="It may have been deleted." />;

  const isMine = viewer.id === list.ownerId;
  const count = list.albums.length;

  const onDelete = async () => {
    setDeleteError(null);
    try {
      if (await confirmAndDelete(list.id)) navigate(`/u/${viewer.handle}`, { replace: true });
    } catch (err) {
      setDeleteError((err as Error).message);
    }
  };

  return (
    <div>
      <PageHeader
        title={list.title}
        subtitle={`${count} ${count === 1 ? "album" : "albums"}`}
        backTo={`/u/${list.owner.handle}`}
      />
      <div className="border-b border-line p-4">
        <h2 className="break-words text-xl font-extrabold leading-tight">{list.title}</h2>
        {list.description && <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-snug">{list.description}</p>}
        <Link to={`/u/${list.owner.handle}`} className="group mt-2 inline-flex items-center gap-2 text-sm">
          <Avatar profile={list.owner} size={24} />
          <span className="font-semibold group-hover:underline">{list.owner.displayName}</span>
        </Link>
        {isMine && (
          <div className="mt-3 flex flex-wrap gap-2">
            <Link to={`/lists/${list.id}/edit`} className="btn btn-outline h-8 px-3 text-xs">
              Edit list
            </Link>
            <button
              type="button"
              onClick={onDelete}
              className="btn btn-outline h-8 border-danger px-3 text-xs text-danger hover:bg-danger/10"
            >
              Delete list
            </button>
          </div>
        )}
        {deleteError && (
          <p role="alert" className="mt-2 text-xs text-danger">
            {deleteError}
          </p>
        )}
      </div>
      {count === 0 ? (
        <p className="px-6 py-12 text-center text-sm text-muted">
          {isMine ? "No albums yet. Edit this list to add some." : "No albums in this list yet."}
        </p>
      ) : (
        <ol>
          {list.albums.map((album) => (
            <li key={`${album.title}|${album.artist}`} className="flex items-center gap-3 border-b border-line px-4 py-2.5">
              <AlbumRow album={album} />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

async function confirmAndDelete(listId: string): Promise<boolean> {
  if (!window.confirm("Delete this list? The albums and your ratings of them stay. This can't be undone.")) return false;
  await deleteAlbumList(listId);
  return true;
}

function AlbumRow({ album }: { album: Album }) {
  return (
    <>
      <AlbumCover src={album.coverUrl} title={album.title} className="size-12 shrink-0 rounded-lg" />
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block truncate text-sm font-bold">{album.title}</span>
        {album.artist && (
          <span className="block truncate text-xs text-muted">
            {album.artist}
            {album.year ? ` · ${album.year}` : ""}
          </span>
        )}
        <CoverDescription album={album} />
      </span>
    </>
  );
}

/** /lists/new */
export function NewListPage() {
  return <ListForm list={null} />;
}

/** /lists/:id/edit — only the list's owner gets the form. */
export function EditListRoute() {
  const { id = "" } = useParams();
  const viewer = useCurrentUser();
  const { data: list, loading, error } = useAsync(() => getAlbumList(id), [id]);

  if (error) return <Message title="This list didn't load." body={error.message} />;
  if (loading && list === undefined) return <ListSkeleton />;
  if (!list || list.ownerId !== viewer.id) {
    return <Message title="You can't edit this list." body="It may have been deleted, or it may belong to someone else." />;
  }
  return <ListForm key={list.id} list={list} />;
}

function ListForm({ list }: { list: AlbumListWithOwner | null }) {
  const viewer = useCurrentUser();
  const navigate = useNavigate();
  const [title, setTitle] = useState(list?.title ?? "");
  const [description, setDescription] = useState(list?.description ?? "");
  const [albums, setAlbums] = useState<Album[]>(list?.albums ?? []);
  const [query, setQuery] = useState("");
  const [albumNotice, setAlbumNotice] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleError = attempted && !title.trim() ? "Give your list a title." : null;

  const addAlbum = ({ title: albumTitle, artist, year, coverUrl }: Album) => {
    const album = { title: albumTitle, artist, year, coverUrl };
    setQuery("");
    if (albums.some((existing) => sameAlbum(existing, album))) {
      setAlbumNotice(`${album.title} is already in this list.`);
      return;
    }
    setAlbumNotice(null);
    setAlbums([...albums, album]);
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setAttempted(true);
    if (!title.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const id = await saveAlbumList({ title, description, albums }, list?.id ?? null);
      navigate(`/lists/${id}`, { replace: true });
    } catch (err) {
      setError(`Couldn't save your list: ${(err as Error).message}`);
      setSubmitting(false);
    }
  };

  const onDelete = async () => {
    if (!list) return;
    setError(null);
    try {
      if (await confirmAndDelete(list.id)) navigate(`/u/${viewer.handle}`, { replace: true });
    } catch (err) {
      setError(`Couldn't delete your list: ${(err as Error).message}`);
    }
  };

  return (
    <div>
      <PageHeader title={list ? "Edit list" : "Create a list"} backTo={list ? `/lists/${list.id}` : `/u/${viewer.handle}`} />
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4 p-4">
        <Field label="Title" htmlFor="list-title" error={titleError}>
          {(describedBy) => (
            <input
              id="list-title"
              type="text"
              autoComplete="off"
              autoFocus
              maxLength={LIST_TITLE_MAX_LENGTH}
              placeholder="Ex.  Sunday morning records"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              aria-invalid={Boolean(titleError) || undefined}
              aria-describedby={describedBy}
              className="field"
            />
          )}
        </Field>

        <Field label="Description (optional)" htmlFor="list-description">
          {(describedBy) => (
            <>
              <textarea
                id="list-description"
                rows={3}
                maxLength={LIST_DESCRIPTION_MAX_LENGTH}
                placeholder="What ties these albums together?"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                aria-describedby={describedBy}
                className="field h-auto resize-y py-2.5 leading-relaxed"
              />
              <p className="mt-1 text-right text-xs tabular-nums text-muted" aria-live="polite">
                {description.length}/{LIST_DESCRIPTION_MAX_LENGTH}
              </p>
            </>
          )}
        </Field>

        <Field label="Add albums" htmlFor="album" hint={albumNotice}>
          {(describedBy) => (
            <AlbumSearchField
              query={query}
              selected={null}
              onQueryChange={setQuery}
              onSelect={addAlbum}
              describedBy={describedBy}
            />
          )}
        </Field>

        {albums.length > 0 && (
          <ol aria-label="Albums in this list" className="rounded-xl border border-line">
            {albums.map((album) => (
              <li
                key={`${album.title}|${album.artist}`}
                className="flex items-center gap-3 border-b border-line px-3 py-2 last:border-b-0"
              >
                <AlbumRow album={album} />
                <button
                  type="button"
                  aria-label={`Remove ${album.title}`}
                  onClick={() => setAlbums(albums.filter((other) => !sameAlbum(other, album)))}
                  className="shrink-0 rounded-full p-1.5 text-muted transition-colors hover:bg-danger/10 hover:text-danger"
                >
                  <TrashIcon size={16} />
                </button>
              </li>
            ))}
          </ol>
        )}

        {error && (
          <p role="alert" className="rounded-xl border border-danger/40 bg-card px-4 py-2.5 text-xs text-danger">
            {error}
          </p>
        )}
        <button type="submit" disabled={submitting} className="btn btn-primary h-10 w-full">
          {submitting ? "Saving…" : list ? "Save changes" : "Create list"}
        </button>
        {list && (
          <button
            type="button"
            onClick={onDelete}
            disabled={submitting}
            className="btn btn-outline h-10 w-full border-danger text-danger hover:bg-danger/10"
          >
            Delete list
          </button>
        )}
      </form>
    </div>
  );
}

function Message({ title, body }: { title: string; body: string }) {
  return (
    <div className="px-6 py-16 text-center">
      <p className="text-xl font-extrabold">{title}</p>
      <p className="mt-1 text-sm text-muted">{body}</p>
      <Link to="/" className="btn btn-primary mt-5">
        Back to timeline
      </Link>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="animate-pulse p-4" aria-busy="true" aria-label="Loading list">
      <div className="h-6 w-56 max-w-full rounded-full bg-field" />
      <div className="mt-3 h-4 w-40 rounded-full bg-field" />
      <div className="mt-6 h-40 rounded-xl bg-field" />
    </div>
  );
}
