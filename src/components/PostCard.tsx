import { useState, type MouseEvent } from "react";
import { Link, useNavigate } from "react-router";
import { useCurrentUser } from "../context/SessionContext";
import { canPreview } from "../lib/albumSearch";
import { timeAgo } from "../lib/format";
import type { PostWithAuthor, Profile } from "../types";
import { AlbumCover, CoverDescription } from "./AlbumCover";
import { AlbumPreview } from "./AlbumPreview";
import { Avatar } from "./Avatar";
import { PlayIcon, RepostIcon } from "./Icons";
import { PostActions } from "./PostActions";
import { PostMenu } from "./PostMenu";
import { ScoreBadge } from "./ScoreBadge";

interface PostCardProps {
  post: PostWithAuthor;
  /** Shown above the post when it's in the feed because someone reposted it. */
  repostedBy?: Profile | null;
  /** Called after the viewer deletes their own rating. */
  onDeleted?: (id: string) => void;
}

export function PostCard({ post, repostedBy, onDeleted }: PostCardProps) {
  const { author, album } = post;
  const viewer = useCurrentUser();
  const navigate = useNavigate();
  const profileHref = `/u/${author.handle}`;
  const postHref = `/post/${post.id}`;
  // Players load only on request: a whole feed of them would be slow, and would tell Deezer who's browsing.
  const [previewing, setPreviewing] = useState(false);

  // Pressing anywhere on the card opens it, except on its own controls or while selecting text.
  // The timestamp is a real link to the same place, for keyboards and screen readers.
  const onCardClick = (e: MouseEvent) => {
    if ((e.target as Element).closest("a, button, [role='menu'], [data-preview]")) return;
    if (window.getSelection()?.toString()) return;
    navigate(postHref);
  };

  return (
    <article
      onClick={onCardClick}
      className="cursor-pointer overflow-hidden rounded-2xl border border-line bg-card transition-[border-color,box-shadow] hover:border-rule hover:shadow-xl hover:shadow-black/20"
    >
      {repostedBy && (
        <p className="flex items-center gap-1.5 px-3.5 pt-2.5 text-xs font-semibold text-muted">
          <RepostIcon size={13} className="shrink-0" />
          <Link to={`/u/${repostedBy.handle}`} className="truncate hover:underline">
            {repostedBy.id === viewer.id ? "You" : repostedBy.displayName} reposted
          </Link>
        </p>
      )}

      <header className="flex items-center gap-2 px-2 pt-2">
        {/* One big target for the author's profile: avatar, name, and handle together. */}
        <Link
          to={profileHref}
          aria-label={`${author.displayName} (@${author.handle}), view profile`}
          className="group flex min-w-0 items-center gap-2.5 rounded-full py-1 pl-1 pr-3 transition-colors hover:bg-tint/5"
        >
          <Avatar
            profile={author}
            size={40}
            className="ring-2 ring-transparent transition-shadow group-hover:ring-accent"
          />
          <span className="min-w-0 leading-tight">
            <span className="block truncate text-[0.9375rem] font-bold group-hover:underline">{author.displayName}</span>
            <span className="block truncate text-sm text-muted">@{author.handle}</span>
          </span>
        </Link>
        <Link to={postHref} className="ml-auto shrink-0 pr-1.5 text-sm text-muted hover:underline">
          <time dateTime={post.createdAt}>{timeAgo(post.createdAt)}</time>
        </Link>
        {viewer.id === author.id && (
          <PostMenu
            postId={post.id}
            onEdit={() => navigate(postHref, { state: { edit: true } })}
            onDeleted={onDeleted}
          />
        )}
      </header>

      {/* The album is the hero: big cover art over a blurred wash of its own colors. */}
      <div className="relative mx-2.5 mt-2 overflow-hidden rounded-xl">
        <CoverBackdrop src={album.coverUrl} />
        <div className="relative flex items-center gap-3 p-2">
          <AlbumCover
            src={album.coverUrl}
            title={album.title}
            className="w-20 shrink-0 rounded-lg shadow-md shadow-black/40 sm:w-24"
          />
          <div className="flex min-w-0 flex-1 flex-col self-stretch">
            <h3 className="line-clamp-2 text-base font-bold leading-tight sm:text-lg">{album.title}</h3>
            {album.artist && (
              <p className="truncate text-sm font-medium text-ink/80">
                {album.artist}
                {album.year ? ` · ${album.year}` : ""}
              </p>
            )}
            {post.method === "comparison" && (
              <p className="mt-1 w-fit rounded-full bg-tint/10 px-2 py-0.5 text-xs font-semibold text-ink/80">
                Ranked by comparison
              </p>
            )}
            <CoverDescription album={album} />
            <div className="mt-auto flex items-end justify-between gap-2 pt-1.5">
              {canPreview(album) ? (
                <button
                  type="button"
                  aria-expanded={previewing}
                  aria-label={`${previewing ? "Hide preview of" : "Preview"} ${album.title}`}
                  onClick={() => setPreviewing((open) => !open)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-full bg-tint/10 px-3 text-xs font-bold transition-colors hover:bg-tint/20"
                >
                  <PlayIcon size={10} />
                  {previewing ? "Hide" : "Preview"}
                </button>
              ) : (
                <span />
              )}
              <ScoreBadge rating={post.rating} size="lg" />
            </div>
          </div>
        </div>
      </div>

      {previewing && (
        <div data-preview className="mx-2.5 mt-2 cursor-default">
          <AlbumPreview album={album} />
        </div>
      )}

      {post.review && <p className="mt-2 break-words px-3.5 text-[0.9375rem] leading-snug">{post.review}</p>}

      <PostActions
        post={post}
        onComment={() => navigate(postHref, { state: { comment: true } })}
        className="px-3.5 pb-1 pt-0.5"
      />
    </article>
  );
}

/** A blurred, enlarged copy of the cover behind the album block, dimmed so text stays readable. */
function CoverBackdrop({ src }: { src: string | null | undefined }) {
  const [failed, setFailed] = useState(false);
  return (
    <div aria-hidden="true" className="absolute inset-0 bg-field">
      {src && !failed && (
        <img
          src={src}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
          className="absolute inset-0 h-full w-full scale-150 object-cover opacity-70 blur-2xl saturate-150"
        />
      )}
      <div className="absolute inset-0 bg-linear-to-t from-card/85 via-card/55 to-card/35" />
    </div>
  );
}

/** Spacing for a column of post cards, shared by the timeline and profile tabs. */
export const POST_LIST_CLASS = "flex flex-col gap-2 p-2 sm:gap-2.5 sm:p-3";
