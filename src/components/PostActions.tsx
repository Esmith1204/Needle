import { useEffect, useRef, useState, type ReactNode } from "react";
import { useCurrentUser } from "../context/SessionContext";
import { setLiked, setReposted } from "../lib/api";
import { pop } from "../lib/motion";
import type { PostWithAuthor } from "../types";
import { CommentIcon, HeartIcon, RepostIcon, ShareIcon } from "./Icons";

const SHARE_NOTICE_MS = 2500;

/** Shows a change immediately, then undoes it if saving fails. Follows the database after that. */
function useOptimisticToggle(saved: boolean, save: (next: boolean) => Promise<void>, onError: (message: string) => void) {
  const [value, setValue] = useState(saved);
  const [pending, setPending] = useState(false);
  useEffect(() => setValue(saved), [saved]);

  const toggle = async () => {
    if (pending) return;
    const next = !value;
    setPending(true);
    setValue(next);
    try {
      await save(next);
    } catch (err) {
      setValue(!next);
      onError((err as Error).message);
    } finally {
      setPending(false);
    }
  };

  // The saved count already includes the saved state, so only a difference from it counts.
  const countChange = value === saved ? 0 : value ? 1 : -1;
  return { value, toggle, countChange };
}

interface PostActionsProps {
  post: PostWithAuthor;
  onComment: () => void;
  className?: string;
}

/** The row of buttons under a post: comment, repost, like, and share. */
export function PostActions({ post, onComment, className = "" }: PostActionsProps) {
  const viewer = useCurrentUser();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(noticeTimer.current), []);

  const like = useOptimisticToggle(post.likedByViewer, (next) => setLiked(viewer.id, post.id, next), setError);
  const repost = useOptimisticToggle(post.repostedByViewer, (next) => setReposted(viewer.id, post.id, next), setError);

  const onShare = async () => {
    setError(null);
    const url = `${window.location.origin}/post/${post.id}`;
    const title = `${post.author.displayName} on ${post.album.title}`;
    try {
      // On phones the system's share sheet is what people expect. On computers it's usually a detour.
      if (navigator.share && window.matchMedia("(pointer: coarse)").matches) {
        await navigator.share({ title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setNotice("Link copied");
      window.clearTimeout(noticeTimer.current);
      noticeTimer.current = window.setTimeout(() => setNotice(null), SHARE_NOTICE_MS);
    } catch (err) {
      // Closing the share sheet isn't a failure.
      if ((err as Error).name !== "AbortError") setError("Couldn't copy the link.");
    }
  };

  return (
    <div className={className}>
      <footer className="-ml-2 flex max-w-sm items-center justify-between text-muted">
        <ActionButton label="Comments" count={post.commentCount} onClick={onComment}>
          <CommentIcon size={16} />
        </ActionButton>
        <ActionButton
          label={repost.value ? "Undo repost" : "Repost"}
          count={post.repostCount + repost.countChange}
          active={repost.value}
          flourish
          onClick={() => {
            setError(null);
            void repost.toggle();
          }}
        >
          <RepostIcon size={16} />
        </ActionButton>
        <ActionButton
          label={like.value ? "Unlike" : "Like"}
          count={post.likeCount + like.countChange}
          active={like.value}
          flourish
          onClick={() => {
            setError(null);
            void like.toggle();
          }}
        >
          <HeartIcon size={16} filled={like.value} />
        </ActionButton>
        <ActionButton label="Share" onClick={onShare}>
          <ShareIcon size={16} />
        </ActionButton>
      </footer>
      <p role="status" className="text-xs text-muted empty:hidden">
        {notice}
      </p>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

interface ActionButtonProps {
  label: string;
  count?: number;
  /** Set on the buttons that toggle: makes it a pressed or unpressed button. */
  active?: boolean;
  flourish?: boolean;
  onClick: () => void;
  children: ReactNode;
}

function ActionButton({ label, count, active, flourish, onClick, children }: ActionButtonProps) {
  const icon = useRef<HTMLSpanElement>(null);

  return (
    <button
      type="button"
      aria-label={count ? `${label}, ${count}` : label}
      aria-pressed={active}
      onClick={() => {
        // Only turning something on earns the flourish.
        if (flourish && !active) pop(icon.current);
        onClick();
      }}
      className={`flex items-center gap-1.5 rounded-full p-2 text-xs transition-colors hover:bg-accent/10 hover:text-accent ${
        active ? "text-accent" : ""
      }`}
    >
      <span ref={icon} className="block">
        {children}
      </span>
      {/* Reserved even at zero, so the buttons don't shift when a count appears. */}
      {count !== undefined && <span className="min-w-3 tabular-nums">{count > 0 ? count.toLocaleString() : ""}</span>}
    </button>
  );
}
