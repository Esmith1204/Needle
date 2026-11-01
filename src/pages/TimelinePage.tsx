import { useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { PostCard } from "../components/PostCard";
import { Tabs } from "../components/Tabs";
import { useCurrentUser } from "../context/SessionContext";
import { useAsync } from "../hooks/useAsync";
import { useEnterList } from "../hooks/useEnterList";
import { useRealtimeRefresh } from "../hooks/useRealtimeRefresh";
import { listTimeline } from "../lib/api";
import { enter, useGSAP } from "../lib/motion";
import type { FeedItem, FeedScope } from "../types";

const SCOPES: { value: FeedScope; label: string }[] = [
  { value: "everyone", label: "Everyone" },
  { value: "following", label: "Following" },
];

async function loadFeed(scope: FeedScope, viewerId: string) {
  return { scope, items: await listTimeline(scope, viewerId) };
}

export function TimelinePage() {
  const viewer = useCurrentUser();
  const [scope, setScope] = useState<FeedScope>("everyone");
  const { data, error, reload } = useAsync(() => loadFeed(scope, viewer.id), [scope, viewer.id]);
  useRealtimeRefresh(["ratings", "follows", "likes", "reposts", "comments"], reload);
  // Ignore the other tab's posts while this one loads.
  const items = data?.scope === scope ? data.items : undefined;

  const location = useLocation();
  const navigate = useNavigate();
  const justPosted = (location.state as { justPosted?: string } | null)?.justPosted;
  const notice = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (justPosted) enter(notice.current, { y: -8, delay: 0.15 });
    },
    { dependencies: [justPosted] },
  );

  return (
    <div>
      <h1 className="sr-only">Timeline</h1>
      <div className="sticky top-0 z-10 bg-paper/80 backdrop-blur-md">
        <Tabs label="Feed" tabs={SCOPES} value={scope} onChange={setScope} />
      </div>

      {justPosted && (
        <div
          ref={notice}
          role="status"
          className="m-3 flex items-center justify-between rounded-xl border border-rule bg-card px-4 py-2.5 text-sm"
        >
          <span>Your review is live on the timeline.</span>
          <button
            type="button"
            onClick={() => navigate(".", { replace: true, state: null })}
            className="font-semibold text-muted hover:text-ink"
          >
            Dismiss
          </button>
        </div>
      )}

      {error ? (
        <div className="px-6 py-10 text-center">
          <p className="text-lg font-extrabold">The timeline didn't load.</p>
          <p className="mt-1 text-sm text-muted">{error.message}</p>
          <button type="button" onClick={reload} className="btn btn-primary mt-4">
            Try again
          </button>
        </div>
      ) : !items ? (
        <FeedSkeleton />
      ) : items.length > 0 ? (
        <FeedList key={scope} items={items} onDeleted={reload} />
      ) : (
        <div className="px-6 py-12 text-center">
          <p className="text-lg font-extrabold">Nothing here yet.</p>
          <p className="mt-1 text-sm text-muted">
            {scope === "following"
              ? "Follow people to see their ratings here."
              : "Be the first to rate something."}
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Link to="/rate" className="btn btn-primary">
              Rate an album
            </Link>
            {scope === "following" && (
              <Link to="/discover" className="btn btn-outline">
                Find people
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function FeedList({ items, onDeleted }: { items: FeedItem[]; onDeleted: () => void }) {
  const list = useRef<HTMLOListElement>(null);
  useEnterList(list, items.map(({ post }) => post.id));

  return (
    <ol ref={list}>
      {items.map(({ post, repostedBy }) => (
        <li key={post.id} data-enter-id={post.id}>
          <PostCard post={post} repostedBy={repostedBy} onDeleted={onDeleted} />
        </li>
      ))}
    </ol>
  );
}

function FeedSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading timeline">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex animate-pulse gap-3 border-b border-line px-4 py-3">
          <div className="size-10 shrink-0 rounded-full bg-field" />
          <div className="min-w-0 flex-1">
            <div className="h-3.5 w-48 max-w-full rounded-full bg-field" />
            <div className="mt-2 flex items-center gap-3 rounded-xl border border-line p-2">
              <div className="size-14 shrink-0 rounded-lg bg-field" />
              <div className="h-3.5 w-1/2 rounded-full bg-field" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
