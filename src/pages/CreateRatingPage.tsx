import { useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import { AlbumCover } from "../components/AlbumCover";
import { AlbumSearchField } from "../components/AlbumSearchField";
import { ComparisonRater } from "../components/ComparisonRater";
import { Field } from "../components/FormField";
import { UploadIcon } from "../components/Icons";
import { PageHeader } from "../components/PageHeader";
import { ScoreInput } from "../components/ScoreInput";
import { useCurrentUser } from "../context/SessionContext";
import { useAsync } from "../hooks/useAsync";
import { listRatingsByUser, saveRating } from "../lib/api";
import { COMPARISON_UNLOCK } from "../lib/compareRank";
import { fileToCoverDataUrl, parseRating, REVIEW_MAX_LENGTH } from "../lib/format";
import type { AlbumSearchResult } from "../lib/itunes";
import type { Album, RatingMethod } from "../types";

interface FieldErrors {
  album?: string;
  rating?: string;
  review?: string;
}

export function CreateRatingPage() {
  const navigate = useNavigate();
  const user = useCurrentUser();
  const fileInput = useRef<HTMLInputElement>(null);
  // The user's past ratings: the comparison pool and the unlock count.
  const past = useAsync(() => listRatingsByUser(user.id, user.id), [user.id]);

  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<AlbumSearchResult | null>(null);
  const [uploadedCover, setUploadedCover] = useState<string | null>(null);
  const [method, setMethod] = useState<RatingMethod>("manual");
  const [ratingText, setRatingText] = useState("");
  const [comparisonScore, setComparisonScore] = useState<number | null>(null);
  const [review, setReview] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const coverUrl = uploadedCover ?? selected?.coverUrl ?? null;
  const albumTitle = selected?.title ?? query.trim();
  const album: Album | null =
    albumTitle && coverUrl
      ? { title: albumTitle, artist: selected?.artist ?? null, year: selected?.year ?? null, coverUrl }
      : null;
  const ratingCount = past.data?.length ?? 0;
  const comparisonUnlocked = ratingCount >= COMPARISON_UNLOCK;
  const rating = method === "manual" ? parseRating(ratingText) : comparisonScore;
  const errors = validate();
  const visibleErrors: FieldErrors = attempted ? errors : {};

  function validate(): FieldErrors {
    const e: FieldErrors = {};
    if (!albumTitle) e.album = "Enter the album you listened to.";
    else if (!coverUrl) e.album = "Pick an album from the search results or upload its cover.";
    if (method === "manual") {
      if (rating === null) e.rating = "Use a score from 0.0 to 10.0 with at most one decimal (e.g. 8.5).";
    } else if (!comparisonUnlocked) {
      e.rating = `Rating by comparison needs at least ${COMPARISON_UNLOCK} ratings. Switch to “Score it”.`;
    } else if (rating === null) {
      e.rating = album ? "Finish the comparison to get a score." : "Pick the album first, then compare.";
    }
    if (review.length > REVIEW_MAX_LENGTH) e.review = `Keep it to ${REVIEW_MAX_LENGTH} characters.`;
    return e;
  }

  const onUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadError(null);
    try {
      setUploadedCover(await fileToCoverDataUrl(file));
      setComparisonScore(null);
    } catch (err) {
      setUploadError((err as Error).message);
    }
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setAttempted(true);
    if (Object.keys(errors).length > 0 || rating === null || !album) return;

    setSubmitting(true);
    setSubmitError(null);
    try {
      const post = await saveRating(user.id, { album, rating, review: review.trim(), method });
      navigate("/", { state: { justPosted: post.id } });
    } catch (err) {
      setSubmitting(false);
      setSubmitError(`Couldn't save your rating: ${(err as Error).message}`);
    }
  };

  return (
    <div>
      <PageHeader title="Rate an album" />
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4 p-4">
        <Field label="Album" htmlFor="album" error={visibleErrors.album}>
          {(describedBy) => (
            <>
              <AlbumSearchField
                query={query}
                selected={selected}
                onQueryChange={(q) => {
                  setQuery(q);
                  setSelected(null);
                  setComparisonScore(null);
                }}
                onSelect={(picked) => {
                  setSelected(picked);
                  setQuery(picked.title);
                  setComparisonScore(null);
                }}
                invalid={Boolean(visibleErrors.album)}
                describedBy={describedBy}
              />
              <div className="mt-2 flex items-center gap-3">
                <AlbumCover src={coverUrl} title={albumTitle || "your album"} className="size-12 shrink-0 rounded-lg" />
                <div className="min-w-0 flex-1 text-xs">
                  <p className="truncate font-bold">
                    {selected
                      ? `${selected.artist}${selected.year ? ` · ${selected.year}` : ""}`
                      : uploadedCover
                        ? albumTitle || "Uploaded cover"
                        : "No cover yet"}
                  </p>
                  <p className="text-muted">
                    {uploadedCover
                      ? "Using your uploaded image"
                      : selected
                        ? "Cover from Apple Music"
                        : "Pick a search result or upload artwork."}
                  </p>
                </div>
                {uploadedCover ? (
                  <button
                    type="button"
                    onClick={() => setUploadedCover(null)}
                    className="shrink-0 text-xs font-semibold text-muted underline underline-offset-2 hover:text-ink"
                  >
                    Remove
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInput.current?.click()}
                    className="btn btn-outline h-8 shrink-0 px-3 text-xs"
                  >
                    <UploadIcon size={14} />
                    Upload cover
                  </button>
                )}
                <input ref={fileInput} type="file" accept="image/*" hidden onChange={onUpload} />
              </div>
              {uploadError && <p className="mt-1.5 text-xs text-danger">{uploadError}</p>}
            </>
          )}
        </Field>

        <Field
          label="Your rating"
          htmlFor={method === "manual" ? "rating" : "rating-mode-compare"}
          error={visibleErrors.rating}
        >
          {(describedBy) => (
            <>
              <div role="radiogroup" aria-label="How to rate" className="mb-2 grid grid-cols-2 rounded-full border border-line p-0.5">
                <ModeButton id="rating-mode-manual" active={method === "manual"} onClick={() => setMethod("manual")}>
                  Score it
                </ModeButton>
                <ModeButton id="rating-mode-compare" active={method === "comparison"} onClick={() => setMethod("comparison")}>
                  Compare
                  {!comparisonUnlocked && !past.loading && (
                    <span className="ml-1 font-normal opacity-70">· {COMPARISON_UNLOCK}+ ratings</span>
                  )}
                </ModeButton>
              </div>

              {method === "manual" ? (
                <ScoreInput
                  id="rating"
                  value={ratingText}
                  onChange={setRatingText}
                  invalid={Boolean(visibleErrors.rating)}
                  describedBy={describedBy}
                />
              ) : past.loading && !past.data ? (
                <p className="text-sm text-muted">Loading your ratings…</p>
              ) : past.error ? (
                <p className="text-sm text-danger">Couldn&rsquo;t load your ratings: {past.error.message}</p>
              ) : !comparisonUnlocked ? (
                <div role="status" className="rounded-xl border border-line bg-card p-3 text-sm leading-relaxed">
                  <p className="font-bold">Rating by comparison unlocks at {COMPARISON_UNLOCK} ratings.</p>
                  <p className="mt-1 text-muted">
                    You&rsquo;ve rated {ratingCount} {ratingCount === 1 ? "album" : "albums"} so far. Score{" "}
                    {COMPARISON_UNLOCK - ratingCount} more with &ldquo;Score it&rdquo; and this option will rank new
                    albums against the ones you&rsquo;ve already rated.
                  </p>
                  <button
                    type="button"
                    onClick={() => setMethod("manual")}
                    className="mt-2 text-xs font-semibold underline underline-offset-4"
                  >
                    Score it instead
                  </button>
                </div>
              ) : !album ? (
                <p className="rounded-xl border border-line bg-card p-3 text-sm text-muted">
                  Pick the album above first, then compare it with your past ratings.
                </p>
              ) : (
                <ComparisonRater
                  key={`${album.title}|${album.artist}|${album.coverUrl}`}
                  album={album}
                  pastRatings={past.data ?? []}
                  onScore={setComparisonScore}
                />
              )}
            </>
          )}
        </Field>

        <Field label="Review (optional)" htmlFor="review" error={visibleErrors.review}>
          {(describedBy) => (
            <>
              <textarea
                id="review"
                rows={3}
                maxLength={REVIEW_MAX_LENGTH}
                placeholder="What did you think of it?"
                value={review}
                onChange={(e) => setReview(e.target.value)}
                aria-describedby={describedBy}
                className="field h-auto resize-y py-2.5 leading-relaxed"
              />
              <p
                className={`mt-1 text-right text-xs tabular-nums ${
                  review.length >= REVIEW_MAX_LENGTH ? "text-ink" : "text-muted"
                }`}
                aria-live="polite"
              >
                {review.length}/{REVIEW_MAX_LENGTH}
              </p>
            </>
          )}
        </Field>

        {submitError && (
          <p role="alert" className="rounded-xl border border-danger/40 bg-card px-4 py-2.5 text-xs text-danger">
            {submitError}
          </p>
        )}
        <button type="submit" disabled={submitting} className="btn btn-primary h-10 w-full">
          {submitting ? "Posting…" : "Post rating"}
        </button>
        <p className="text-center text-xs text-muted">
          Your rating will appear on{" "}
          <Link to={`/u/${user.handle}`} className="underline underline-offset-2">
            your profile
          </Link>{" "}
          and the timeline.
        </p>
      </form>
    </div>
  );
}

function ModeButton({
  id,
  active,
  onClick,
  children,
}: {
  id: string;
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      id={id}
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
        active ? "bg-brand text-white" : "text-muted hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}
