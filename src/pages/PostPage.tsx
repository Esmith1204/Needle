import { useEffect, useRef, useState, type FormEvent, type Ref } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { AlbumCover, CoverDescription } from "../components/AlbumCover";
import { Avatar } from "../components/Avatar";
import { Field } from "../components/FormField";
import { TrashIcon } from "../components/Icons";
import { PageHeader } from "../components/PageHeader";
import { PostActions } from "../components/PostActions";
import { PostMenu } from "../components/PostMenu";
import { ScoreBadge } from "../components/ScoreBadge";
import { ScoreInput } from "../components/ScoreInput";
import { useCurrentUser } from "../context/SessionContext";
import { useAsync } from "../hooks/useAsync";
import { useRealtimeRefresh } from "../hooks/useRealtimeRefresh";
import { addComment, deleteComment, getPost, listComments, updateRating } from "../lib/api";
import {
  COMMENT_MAX_LENGTH,
  formatRating,
  fullTimestamp,
  parseRating,
  REVIEW_MAX_LENGTH,
  timeAgo,
} from "../lib/format";
import type { PostComment, PostWithAuthor } from "../types";

/** /post/:id — keyed by id so state resets when moving between posts. */
export function PostRoute() {
  const { id = "" } = useParams();
  return <PostPage key={id} id={id} />;
}

async function loadPost(id: string, viewerId: string) {
  const post = await getPost(id, viewerId);
  return post && { post, comments: await listComments(post.id) };
}

function PostPage({ id }: { id: string }) {
  const viewer = useCurrentUser();
  const location = useLocation();
  const navigate = useNavigate();
  // The card that linked here says what its button was for.
  const arrivedFor = location.state as { edit?: boolean; comment?: boolean } | null;
  const { data, loading, error, reload } = useAsync(() => loadPost(id, viewer.id), [id, viewer.id]);
  useRealtimeRefresh(["ratings", "likes", "reposts", "comments"], reload);
  const [editing, setEditing] = useState(Boolean(arrivedFor?.edit));
  const composer = useRef<HTMLTextAreaElement>(null);
  const hasPost = Boolean(data);

  const closeEditor = () => {
    setEditing(false);
    // Otherwise going back to this page would reopen the form.
    if (arrivedFor?.edit) navigate(".", { replace: true, state: null });
  };

  useEffect(() => {
    if (hasPost && arrivedFor?.comment) composer.current?.focus();
  }, [hasPost, arrivedFor?.comment]);

  return (
    <div>
      <PageHeader title="Post" backTo="/" />
      {error ? (
        <Message title="This post didn't load." body={error.message} />
      ) : loading && data === undefined ? (
        <PostSkeleton />
      ) : !data ? (
        <Message title="This post isn't here." body="It may have been deleted." />
      ) : (
        <>
          <article className="border-b border-line px-4 pb-1 pt-3">
            <header className="flex items-center gap-3">
              <Link to={`/u/${data.post.author.handle}`} aria-label={`${data.post.author.displayName}'s profile`}>
                <Avatar profile={data.post.author} size={44} />
              </Link>
              <p className="min-w-0 flex-1 text-sm leading-tight">
                <Link to={`/u/${data.post.author.handle}`} className="block truncate font-bold hover:underline">
                  {data.post.author.displayName}
                </Link>
                <span className="block truncate text-muted">@{data.post.author.handle}</span>
              </p>
              {viewer.id === data.post.author.id && (
                <PostMenu
                  postId={data.post.id}
                  onEdit={() => setEditing(true)}
                  onDeleted={() => navigate(`/u/${viewer.handle}`, { replace: true })}
                />
              )}
            </header>

            <div className="mt-3 flex items-center gap-3 rounded-xl border border-line bg-tint/[0.03] p-3">
              <AlbumCover src={data.post.album.coverUrl} title={data.post.album.title} className="size-20 shrink-0 rounded-lg" />
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-bold leading-snug">{data.post.album.title}</h2>
                {data.post.album.artist && (
                  <p className="text-sm text-muted">
                    {data.post.album.artist}
                    {data.post.album.year ? ` · ${data.post.album.year}` : ""}
                  </p>
                )}
                {data.post.method === "comparison" && <p className="text-xs text-muted">Ranked by comparison</p>}
                <CoverDescription album={data.post.album} />
              </div>
              <ScoreBadge rating={data.post.rating} />
            </div>

            {editing && viewer.id === data.post.author.id ? (
              <EditReviewForm
                post={data.post}
                onDone={() => {
                  closeEditor();
                  reload();
                }}
                onCancel={closeEditor}
              />
            ) : (
              data.post.review && <p className="mt-3 break-words text-lg leading-snug">{data.post.review}</p>
            )}

            <p className="mt-3 border-b border-line pb-3 text-sm text-muted">
              <time dateTime={data.post.createdAt}>{fullTimestamp(data.post.createdAt)}</time>
            </p>
            <PostActions post={data.post} onComment={() => composer.current?.focus()} className="py-1" />
          </article>

          <CommentComposer ref={composer} ratingId={data.post.id} onPosted={reload} />
          <CommentList comments={data.comments} onDeleted={reload} />
        </>
      )}
    </div>
  );
}

interface EditReviewFormProps {
  post: PostWithAuthor;
  onDone: () => void;
  onCancel: () => void;
}

function EditReviewForm({ post, onDone, onCancel }: EditReviewFormProps) {
  const [ratingText, setRatingText] = useState(formatRating(post.rating));
  const [review, setReview] = useState(post.review);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const rating = parseRating(ratingText);
  const ratingError = rating === null ? "Use a score from 0.0 to 10.0 with at most one decimal (e.g. 8.5)." : null;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (rating === null) return;
    setSubmitting(true);
    setError(null);
    try {
      await updateRating(post.id, {
        rating,
        review: review.trim(),
        // A score typed in by hand no longer came from comparing albums.
        method: rating === post.rating ? post.method : "manual",
      });
      onDone();
    } catch (err) {
      setError(`Couldn't save your changes: ${(err as Error).message}`);
      setSubmitting(false);
    }
  };

  return (
    <form noValidate onSubmit={onSubmit} className="mt-3 flex flex-col gap-3">
      <Field label="Your rating" htmlFor="edit-rating" error={ratingError}>
        {(describedBy) => (
          <ScoreInput
            id="edit-rating"
            value={ratingText}
            onChange={setRatingText}
            invalid={Boolean(ratingError)}
            describedBy={describedBy}
          />
        )}
      </Field>
      <Field label="Review (optional)" htmlFor="edit-review">
        {(describedBy) => (
          <>
            <textarea
              id="edit-review"
              rows={3}
              autoFocus
              maxLength={REVIEW_MAX_LENGTH}
              value={review}
              onChange={(e) => setReview(e.target.value)}
              aria-describedby={describedBy}
              className="field h-auto resize-y py-2.5 leading-relaxed"
            />
            <p className="mt-1 text-right text-xs tabular-nums text-muted" aria-live="polite">
              {review.length}/{REVIEW_MAX_LENGTH}
            </p>
          </>
        )}
      </Field>
      {error && (
        <p role="alert" className="rounded-xl border border-danger/40 bg-card px-4 py-2.5 text-xs text-danger">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button type="submit" disabled={submitting || rating === null} className="btn btn-primary">
          {submitting ? "Saving…" : "Save changes"}
        </button>
        <button type="button" onClick={onCancel} disabled={submitting} className="btn btn-outline">
          Cancel
        </button>
      </div>
    </form>
  );
}

interface CommentComposerProps {
  ref: Ref<HTMLTextAreaElement>;
  ratingId: string;
  onPosted: () => void;
}

function CommentComposer({ ref, ratingId, onPosted }: CommentComposerProps) {
  const viewer = useCurrentUser();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const empty = body.trim() === "";

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (empty) return;
    setSubmitting(true);
    setError(null);
    try {
      await addComment(viewer.id, ratingId, body);
      setBody("");
      onPosted();
    } catch (err) {
      setError(`Couldn't post your comment: ${(err as Error).message}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form noValidate onSubmit={onSubmit} className="flex gap-3 border-b border-line px-4 py-3">
      <Avatar profile={viewer} size={40} />
      <div className="min-w-0 flex-1">
        <label htmlFor="comment" className="sr-only">
          Add a comment
        </label>
        <textarea
          ref={ref}
          id="comment"
          rows={2}
          maxLength={COMMENT_MAX_LENGTH}
          placeholder="Add a comment"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="field h-auto resize-y py-2 leading-relaxed"
        />
        {error && (
          <p role="alert" className="mt-1.5 text-xs text-danger">
            {error}
          </p>
        )}
        <div className="mt-2 flex items-center justify-end gap-3">
          <span className="text-xs tabular-nums text-muted" aria-live="polite">
            {body.length}/{COMMENT_MAX_LENGTH}
          </span>
          <button type="submit" disabled={empty || submitting} className="btn btn-primary h-8 px-4 text-xs">
            {submitting ? "Posting…" : "Comment"}
          </button>
        </div>
      </div>
    </form>
  );
}

function CommentList({ comments, onDeleted }: { comments: PostComment[]; onDeleted: () => void }) {
  if (comments.length === 0) {
    return <p className="px-6 py-10 text-center text-sm text-muted">No comments yet. Start the conversation.</p>;
  }
  return (
    <section aria-label="Comments">
      <ol>
        {comments.map((comment) => (
          <li key={comment.id}>
            <CommentRow comment={comment} onDeleted={onDeleted} />
          </li>
        ))}
      </ol>
    </section>
  );
}

function CommentRow({ comment, onDeleted }: { comment: PostComment; onDeleted: () => void }) {
  const viewer = useCurrentUser();
  const { author } = comment;
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onDelete = async () => {
    if (!window.confirm("Delete this comment? This can't be undone.")) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteComment(comment.id);
      onDeleted();
    } catch (err) {
      setError((err as Error).message);
      setDeleting(false);
    }
  };

  return (
    <article className="flex gap-3 border-b border-line px-4 py-3">
      <Link to={`/u/${author.handle}`} aria-label={`${author.displayName}'s profile`} className="shrink-0">
        <Avatar profile={author} size={40} />
      </Link>
      <div className="min-w-0 flex-1">
        <header className="flex items-center gap-1">
          <p className="min-w-0 flex-1 truncate text-sm">
            <Link to={`/u/${author.handle}`} className="font-bold hover:underline">
              {author.displayName}
            </Link>{" "}
            <span className="text-muted">
              @{author.handle} · <time dateTime={comment.createdAt}>{timeAgo(comment.createdAt)}</time>
            </span>
          </p>
          {viewer.id === author.id && (
            <button
              type="button"
              aria-label="Delete comment"
              onClick={onDelete}
              disabled={deleting}
              className="-my-1 -mr-1.5 rounded-full p-1 text-muted transition-colors hover:bg-danger/10 hover:text-danger disabled:opacity-60"
            >
              <TrashIcon size={16} />
            </button>
          )}
        </header>
        <p className="mt-0.5 whitespace-pre-wrap break-words text-[0.9375rem] leading-snug">{comment.body}</p>
        {error && (
          <p role="alert" className="mt-1 text-xs text-danger">
            {error}
          </p>
        )}
      </div>
    </article>
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

function PostSkeleton() {
  return (
    <div className="animate-pulse px-4 py-3" aria-busy="true" aria-label="Loading post">
      <div className="flex items-center gap-3">
        <div className="size-11 rounded-full bg-field" />
        <div className="h-4 w-40 rounded-full bg-field" />
      </div>
      <div className="mt-3 h-[6.5rem] rounded-xl bg-field" />
    </div>
  );
}
