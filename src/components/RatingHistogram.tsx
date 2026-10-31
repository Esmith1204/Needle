import { useRef } from "react";
import { formatRating } from "../lib/format";
import { gsap, reducedMotion, useGSAP } from "../lib/motion";

// Letterboxd-style ratings spread: one bar per whole point (0–9, plus 10.0),
// single series in the accent color, with a hover tooltip and a screen-reader table.

const BUCKETS = Array.from({ length: 11 }, (_, i) => i);

function bucketLabel(b: number) {
  return b === 10 ? "10.0" : `${b}.0–${b}.9`;
}

export function RatingHistogram({ ratings }: { ratings: number[] }) {
  const root = useRef<HTMLElement>(null);
  const counts = BUCKETS.map((b) => ratings.filter((r) => Math.floor(r) === b).length);
  const max = Math.max(1, ...counts);
  const average = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null;

  // Bars grow in once on arrival; later changes from realtime updates just resize.
  useGSAP(
    () => {
      if (reducedMotion()) return;
      gsap.from("[data-bar]", {
        scaleY: 0,
        transformOrigin: "bottom",
        duration: 0.4,
        ease: "power2.out",
        stagger: 0.02,
        clearProps: "transform",
      });
    },
    { scope: root },
  );

  return (
    <figure ref={root}>
      <figcaption className="flex items-baseline justify-between">
        <span className="text-sm font-extrabold">Ratings</span>
        <span className="text-xs text-muted">
          avg <span className="font-bold text-ink tabular-nums">{average === null ? "–" : formatRating(average)}</span>
        </span>
      </figcaption>

      <div className="mt-2 flex h-16 items-end gap-[2px]" aria-hidden="true">
        {counts.map((count, b) => (
          <div key={b} className="group relative flex h-full flex-1 items-end">
            <div
              data-bar
              className="w-full rounded-t-[4px] bg-accent/80 transition-colors group-hover:bg-accent"
              style={{ height: count ? `${(count / max) * 100}%` : 2, opacity: count ? 1 : 0.25 }}
            />
            <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-[11px] font-semibold text-paper group-hover:block">
              {bucketLabel(b)}: {count} {count === 1 ? "rating" : "ratings"}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted tabular-nums" aria-hidden="true">
        <span>0</span>
        <span>5</span>
        <span>10</span>
      </div>

      <table className="sr-only">
        <caption>Number of ratings per score range</caption>
        <thead>
          <tr>
            <th scope="col">Score</th>
            <th scope="col">Ratings</th>
          </tr>
        </thead>
        <tbody>
          {counts.map((count, b) => (
            <tr key={b}>
              <td>{bucketLabel(b)}</td>
              <td>{count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
