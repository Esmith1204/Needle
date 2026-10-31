import { formatRating } from "../lib/format";

const SIZES = {
  sm: "h-6 min-w-9 px-2 text-xs",
  md: "h-8 min-w-12 px-2.5 text-base",
};

export function ScoreBadge({ rating, size = "md" }: { rating: number; size?: keyof typeof SIZES }) {
  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-full bg-brand font-extrabold tabular-nums text-white ${SIZES[size]}`}>
      {formatRating(rating)}
      <span className="sr-only"> out of 10</span>
    </span>
  );
}
