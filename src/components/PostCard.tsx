import type { MouseEvent } from "react";
import { Link, useNavigate } from "react-router";
import { useCurrentUser } from "../context/SessionContext";
import { timeAgo } from "../lib/format";
import type { PostWithAuthor, Profile } from "../types";
import { AlbumCover, CoverDescription } from "./AlbumCover";
import { Avatar } from "./Avatar";
import { RepostIcon } from "./Icons";
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

  // Pressing anywhere on the card opens it, except on its own controls or while selecting text.
  // The timestamp is a real link to the same place, for keyboards and screen readers.
  const onCardClick = (e: MouseEvent) => {
    if ((e.target as Element).closest("a, button, [role='menu']")) return;
    if (window.getSelection()?.toString()) return;
    navigate(postHref);
  };

  return (
    <article onClick={onCardClick} className="cursor-pointer border-b border-line px-4 py-3 transition-colors hover:bg-tint/[0.02]">
      {repostedBy && (
        <p className="mb-1 flex items-center gap-1.5 pl-[2.375rem] text-xs font-semibold text-muted">
          <RepostIcon size={13} className="shrink-0" />
          <Link to={`/u/${repostedBy.handle}`} className="truncate hover:underline">
            {repostedBy.id === viewer.id ? "You" : repostedBy.displayName} reposted
          </Link>
        </p>
      )}
      <div className="flex gap-3">
        <Link to={profileHref} aria-label={`${author.displayName}'s profile`} className="shrink-0">
          <Avatar profile={author} size={40} />
        </Link>

        <div className="min-w-0 flex-1">
          <header className="flex items-center gap-1">
            <p className="min-w-0 flex-1 truncate text-sm">
              <Link to={profileHref} className="font-bold hover:underline">
                {author.displayName}
              </Link>{" "}
              <span className="text-muted">
                @{author.handle} ·{" "}
                <Link to={postHref} className="hover:underline">
                  <time dateTime={post.createdAt}>{timeAgo(post.createdAt)}</time>
                </Link>
              </span>
            </p>
            {viewer.id === author.id && (
              <PostMenu
                postId={post.id}
                onEdit={() => navigate(postHref, { state: { edit: true } })}
                onDeleted={onDeleted}
              />
            )}
          </header>

          <div className="mt-1.5 flex items-center gap-3 rounded-xl border border-line bg-tint/[0.03] p-2">
            <AlbumCover src={album.coverUrl} title={album.title} className="size-14 shrink-0 rounded-lg" />
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-[0.9375rem] font-bold leading-snug">{album.title}</h3>
              {album.artist && (
                <p className="truncate text-[0.8125rem] text-muted">
                  {album.artist}
                  {album.year ? ` · ${album.year}` : ""}
                </p>
              )}
              {post.method === "comparison" && <p className="truncate text-xs text-muted">Ranked by comparison</p>}
              <CoverDescription album={album} />
            </div>
            <ScoreBadge rating={post.rating} />
          </div>

          {post.review && <p className="mt-2 break-words text-[0.9375rem] leading-snug">{post.review}</p>}

          <PostActions
            post={post}
            onComment={() => navigate(postHref, { state: { comment: true } })}
            className="mt-1"
          />
        </div>
      </div>
    </article>
  );
}
