import { useState } from "react";
import { Link } from "react-router";
import { useCurrentUser } from "../context/SessionContext";
import { useAsync } from "../hooks/useAsync";
import { useRealtimeRefresh } from "../hooks/useRealtimeRefresh";
import { getProfileByHandle } from "../lib/api";
import { CheckIcon, CloseIcon } from "./Icons";

const dismissKey = (userId: string) => `needle.welcomeDismissed.${userId}`;

function readDismissed(userId: string) {
  try {
    return localStorage.getItem(dismissKey(userId)) === "1";
  } catch {
    return false;
  }
}

/**
 * A getting-started guide at the top of the timeline. It shows until the viewer has
 * rated an album and followed someone, or until they dismiss it.
 */
export function WelcomeBanner() {
  const viewer = useCurrentUser();
  const [dismissed, setDismissed] = useState(() => readDismissed(viewer.id));
  const { data: stats, reload } = useAsync(() => getProfileByHandle(viewer.handle), [viewer.handle]);
  // Ticks the steps off as soon as they're done, even from another tab.
  useRealtimeRefresh(["ratings", "follows"], reload);

  if (dismissed || !stats) return null;
  const rated = stats.ratingCount > 0;
  const following = stats.followingCount > 0;
  if (rated && following) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(dismissKey(viewer.id), "1");
    } catch {
      // Private mode: it stays hidden until the page reloads.
    }
  };

  const firstName = viewer.displayName.trim().split(/\s+/)[0];
  const done = Number(rated) + Number(following);

  return (
    <section
      aria-labelledby="welcome-heading"
      className="relative mx-2 mt-2 overflow-hidden rounded-2xl border border-rule bg-card p-4 sm:mx-3 sm:mt-3 sm:p-5"
    >
      <div aria-hidden="true" className="bg-brand pointer-events-none absolute inset-0 opacity-[0.12]" />
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss the welcome guide"
        className="absolute right-2 top-2 grid size-9 place-items-center rounded-full text-muted transition-colors hover:bg-tint/10 hover:text-ink"
      >
        <CloseIcon size={18} />
      </button>

      <div className="relative">
        <h2 id="welcome-heading" className="pr-8 text-xl font-extrabold">
          Welcome to Needle{firstName ? `, ${firstName}` : ""}!
        </h2>
        <p className="mt-1 text-sm text-muted">
          Rate albums, see what your friends are spinning, and find your next favorite record. Two steps to get going
          ({done} of 2 done):
        </p>

        <ol className="mt-4 grid gap-2.5 sm:grid-cols-2">
          <Step
            n={1}
            done={rated}
            title="Rate your first album"
            body="Search for any album and score it from 0 to 10. A review is optional."
            to="/rate"
            action="Rate an album"
            primary
          />
          <Step
            n={2}
            done={following}
            title="Follow a few people"
            body="Their ratings show up in your Following tab."
            to="/discover"
            action="Find people"
          />
        </ol>

        <p className="mt-3 text-xs text-muted">
          Tip: tap any review card below to read it in full, comment, or share it.
        </p>
      </div>
    </section>
  );
}

interface StepProps {
  n: number;
  done: boolean;
  title: string;
  body: string;
  to: string;
  action: string;
  primary?: boolean;
}

function Step({ n, done, title, body, to, action, primary }: StepProps) {
  return (
    <li className={`flex flex-col rounded-xl border border-line bg-paper/60 p-3 ${done ? "opacity-70" : ""}`}>
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className={`grid size-6 shrink-0 place-items-center rounded-full text-xs font-extrabold ${
            done ? "bg-brand text-white" : "border border-rule text-muted"
          }`}
        >
          {done ? <CheckIcon size={14} strokeWidth={2.6} /> : n}
        </span>
        <h3 className="text-[0.9375rem] font-bold">
          {title}
          {done && <span className="sr-only"> (done)</span>}
        </h3>
      </div>
      <p className="mt-1 text-sm text-muted">{body}</p>
      {!done && (
        <Link to={to} className={`btn mt-3 self-start ${primary ? "btn-primary" : "btn-outline"}`}>
          {action}
        </Link>
      )}
    </li>
  );
}
