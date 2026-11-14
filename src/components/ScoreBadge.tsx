import { formatRating } from "../lib/format";

const SIZES = {
  sm: "h-6 min-w-9 rounded-full px-2 text-xs",
  md: "h-8 min-w-12 rounded-full px-2.5 text-base",
  /** The headline number on a review card. */
  lg: "h-10 min-w-13 rounded-xl px-2.5 text-xl shadow-glow",
};

export function ScoreBadge({ rating, size = "md" }: { rating: number; size?: keyof typeof SIZES }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center bg-brand font-display font-extrabold tabular-nums text-white ${SIZES[size]}`}
    >
      {formatRating(rating)}
      <span className="sr-only"> out of 10</span>
    </span>
  );
}
