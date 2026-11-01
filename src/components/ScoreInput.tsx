import { formatRating, parseRating, RATING_PARTIAL_PATTERN } from "../lib/format";

interface ScoreInputProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  describedBy?: string;
}

/** A 0.0–10.0 score, as a text field and a slider kept in step. */
export function ScoreInput({ id, value, onChange, invalid, describedBy }: ScoreInputProps) {
  const rating = parseRating(value);
  return (
    <div className="flex items-center gap-3">
      <div className="relative w-36 shrink-0">
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          placeholder="Score"
          value={value}
          onChange={(e) => {
            const next = e.target.value.replace(",", ".");
            if (RATING_PARTIAL_PATTERN.test(next)) onChange(next);
          }}
          onBlur={() => {
            if (rating !== null) onChange(formatRating(rating));
          }}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          className="field pr-11"
        />
        <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-sm text-muted">/ 10</span>
      </div>
      <input
        type="range"
        min={0}
        max={10}
        step={0.1}
        value={rating ?? 0}
        onChange={(e) => onChange(formatRating(Number(e.target.value)))}
        aria-label="Rating slider"
        className="min-w-0 flex-1 accent-accent"
      />
    </div>
  );
}
