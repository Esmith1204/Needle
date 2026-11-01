import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { useCurrentUser } from "../context/SessionContext";
import { deleteRating } from "../lib/api";
import { enter, pop, useGSAP } from "../lib/motion";
import type { PostWithAuthor } from "../types";
import { timeAgo } from "../lib/format";
import { AlbumCover, CoverDescription } from "./AlbumCover";
import { Avatar } from "./Avatar";
import { BookmarkIcon, CommentIcon, HeartIcon, MoreIcon, RepostIcon } from "./Icons";
import { ScoreBadge } from "./ScoreBadge";

interface PostCardProps {
  post: PostWithAuthor;
  /** Called after the viewer deletes their own rating. */
  onDeleted?: (id: string) => void;
}

export function PostCard({ post, onDeleted }: PostCardProps) {
  const { author, album } = post;
  const viewer = useCurrentUser();
  const profileHref = `/u/${author.handle}`;
  // Likes and bookmarks aren't stored yet; they only toggle on screen.
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);

  return (
    <article className="flex gap-3 border-b border-line px-4 py-3">
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
              @{author.handle} · <time dateTime={post.createdAt}>{timeAgo(post.createdAt)}</time>
            </span>
          </p>
          {viewer.id === author.id && <OwnPostMenu postId={post.id} onDeleted={onDeleted} />}
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

        {post.review && <p className="mt-2 text-[0.9375rem] leading-snug">{post.review}</p>}

        <footer className="-ml-2 mt-1 flex max-w-xs items-center justify-between text-muted">
          <ActionButton label="Comments">
            <CommentIcon size={16} />
          </ActionButton>
          <ActionButton label="Reposts">
            <RepostIcon size={16} />
          </ActionButton>
          <ActionButton label={liked ? "Unlike" : "Like"} active={liked} onClick={() => setLiked((v) => !v)}>
            <HeartIcon size={16} filled={liked} />
          </ActionButton>
          <ActionButton label={saved ? "Remove bookmark" : "Bookmark"} active={saved} onClick={() => setSaved((v) => !v)}>
            <BookmarkIcon size={16} filled={saved} />
          </ActionButton>
        </footer>
      </div>
    </article>
  );
}

interface ActionButtonProps {
  label: string;
  count?: number;
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
}

function ActionButton({ label, count, active, onClick, children }: ActionButtonProps) {
  const icon = useRef<HTMLSpanElement>(null);

  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={onClick ? active : undefined}
      onClick={() => {
        if (!onClick) return;
        // Only turning something on earns the flourish.
        if (!active) pop(icon.current);
        onClick();
      }}
      className={`flex items-center gap-2 rounded-full p-2 transition-colors hover:bg-accent/10 hover:text-accent ${
        active ? "text-accent" : ""
      }`}
    >
      <span ref={icon} className="block">
        {children}
      </span>
      {count !== undefined && <span className="tabular-nums">{count}</span>}
    </button>
  );
}

function OwnPostMenu({ postId, onDeleted }: { postId: string; onDeleted?: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const popover = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !menuRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  useGSAP(
    () => {
      if (open) enter(popover.current, { y: -4, scale: 0.96, duration: 0.16, transformOrigin: "top right" });
    },
    { dependencies: [open] },
  );

  const onDelete = async () => {
    if (!window.confirm("Delete this rating? This can't be undone.")) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteRating(postId);
      setOpen(false);
      onDeleted?.(postId);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div ref={menuRef} className="relative -my-1 -mr-1.5">
      <button
        type="button"
        aria-label="More options"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="rounded-full p-1 text-muted transition-colors hover:bg-tint/5 hover:text-ink"
      >
        <MoreIcon size={18} />
      </button>
      {open && (
        <div
          ref={popover}
          role="menu"
          className="absolute right-0 top-full z-10 mt-1 w-44 overflow-hidden rounded-xl border border-rule bg-card py-1 shadow-[0_12px_32px_-12px_rgb(0_0_0/0.7)]"
        >
          <button
            type="button"
            role="menuitem"
            onClick={onDelete}
            disabled={deleting}
            className="w-full px-4 py-2 text-left text-sm font-semibold text-danger hover:bg-field disabled:opacity-60"
          >
            {deleting ? "Deleting…" : "Delete rating"}
          </button>
          {error && <p className="px-4 pb-2 text-xs text-danger">{error}</p>}
        </div>
      )}
    </div>
  );
}
