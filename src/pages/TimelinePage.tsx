import { useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { AlbumSuggestions } from "../components/AlbumSuggestions";
import { POST_LIST_CLASS, PostCard } from "../components/PostCard";
import { CompassIcon, PlusIcon } from "../components/Icons";
import { Tabs } from "../components/Tabs";
import { WelcomeBanner } from "../components/WelcomeBanner";
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

      <WelcomeBanner />
      <AlbumSuggestions userId={viewer.id} />

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
        <EmptyFeed scope={scope} onShowEveryone={() => setScope("everyone")} />
      )}
    </div>
  );
}

/** Shown when a tab has no posts: says why, and offers the next step. */
function EmptyFeed({ scope, onShowEveryone }: { scope: FeedScope; onShowEveryone: () => void }) {
  const following = scope === "following";
  return (
    <div className="mx-2 my-3 rounded-2xl border border-dashed border-rule px-6 py-10 text-center sm:mx-3">
      <span aria-hidden="true" className="mx-auto grid size-14 place-items-center rounded-full bg-tint/5 text-accent">
        {following ? <CompassIcon size={26} /> : <PlusIcon size={26} strokeWidth={2.2} />}
      </span>
      <h2 className="mt-3 text-xl font-extrabold">
        {following ? "Your Following feed is empty" : "No ratings yet"}
      </h2>
      <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
        {following
          ? "When you follow people, their ratings and reviews show up here. Find a few people whose taste you trust."
          : "Nobody has rated anything yet. Rate an album and yours will be the first review on Needle."}
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {following ? (
          <>
            <Link to="/discover" className="btn btn-primary">
              Find people to follow
            </Link>
            <button type="button" onClick={onShowEveryone} className="btn btn-outline">
              See everyone&rsquo;s ratings
            </button>
          </>
        ) : (
          <Link to="/rate" className="btn btn-primary">
            Rate an album
          </Link>
        )}
      </div>
    </div>
  );
}

function FeedList({ items, onDeleted }: { items: FeedItem[]; onDeleted: () => void }) {
  const list = useRef<HTMLOListElement>(null);
  useEnterList(list, items.map(({ post }) => post.id));

  return (
    <ol ref={list} className={POST_LIST_CLASS}>
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
    <div aria-busy="true" aria-label="Loading timeline" className={POST_LIST_CLASS}>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="animate-pulse rounded-2xl border border-line bg-card p-2.5">
          <div className="flex items-center gap-2.5 px-1">
            <div className="size-8 shrink-0 rounded-full bg-field" />
            <div className="h-3.5 w-40 max-w-full rounded-full bg-field" />
          </div>
          <div className="mt-2 flex items-center gap-3 rounded-xl bg-field/60 p-2">
            <div className="aspect-square w-20 shrink-0 rounded-lg bg-placeholder sm:w-24" />
            <div className="min-w-0 flex-1">
              <div className="h-4 w-3/4 rounded-full bg-placeholder" />
              <div className="mt-2 h-3 w-1/2 rounded-full bg-placeholder" />
            </div>
          </div>
          <div className="mx-1 mt-2.5 h-3 w-5/6 rounded-full bg-field" />
        </div>
      ))}
    </div>
  );
}
