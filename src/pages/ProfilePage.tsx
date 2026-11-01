import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, Navigate, useParams } from "react-router";
import { AlbumCover, CoverDescription } from "../components/AlbumCover";
import { Avatar } from "../components/Avatar";
import { CheckIcon, GridIcon, ListIcon, PlusIcon } from "../components/Icons";
import { PageHeader } from "../components/PageHeader";
import { PostCard } from "../components/PostCard";
import { ProfileImage } from "../components/ProfileImage";
import { ProfileImagesDialog } from "../components/ProfileImagesDialog";
import { ProfileLists } from "../components/ProfileLists";
import { RatingHistogram } from "../components/RatingHistogram";
import { Tabs } from "../components/Tabs";
import { useCurrentUser } from "../context/SessionContext";
import { useAsync } from "../hooks/useAsync";
import { useRealtimeRefresh } from "../hooks/useRealtimeRefresh";
import {
  getProfileByHandle,
  isFollowing,
  listLikesByUser,
  listRatingsByUser,
  listRepostsByUser,
  setFollowing,
} from "../lib/api";
import { formatRating } from "../lib/format";
import { enter, useGSAP } from "../lib/motion";
import type { FeedItem, PostWithAuthor, ProfileWithStats } from "../types";

type ProfileTab = "ratings" | "reviews" | "reposts" | "likes";

const TABS: { value: ProfileTab; label: string }[] = [
  { value: "ratings", label: "Ratings" },
  { value: "reviews", label: "Reviews" },
  { value: "reposts", label: "Reposts" },
  { value: "likes", label: "Likes" },
];

/** /profile — sends the signed-in user to their own page. */
export function MyProfileRedirect() {
  const user = useCurrentUser();
  return <Navigate to={`/u/${user.handle}`} replace />;
}

/** /u/:handle — keyed by handle so state resets when moving between profiles. */
export function ProfileRoute() {
  const { handle = "" } = useParams();
  return <ProfilePage key={handle} handle={handle} />;
}

async function loadProfile(handle: string, viewerId: string) {
  const profile = await getProfileByHandle(handle);
  if (!profile) return null;
  const [posts, following] = await Promise.all([
    listRatingsByUser(profile.id, viewerId),
    profile.id === viewerId ? false : isFollowing(viewerId, profile.id),
  ]);
  return { profile, posts, following };
}

function ProfilePage({ handle }: { handle: string }) {
  const viewer = useCurrentUser();
  const { data, loading, error, reload } = useAsync(() => loadProfile(handle, viewer.id), [handle, viewer.id]);
  const [tab, setTab] = useState<ProfileTab>("ratings");
  const panel = useRef<HTMLDivElement>(null);
  // Counts and ratings update live as people rate, react, and follow.
  useRealtimeRefresh(["ratings", "follows", "profiles", "likes", "reposts", "comments"], reload);

  useGSAP(() => enter(panel.current, { y: 4, duration: 0.2 }), { dependencies: [tab] });

  if (error) {
    return <Message title="This profile didn't load." body={error.message} />;
  }
  if (loading && data === undefined) {
    return <ProfileSkeleton />;
  }
  if (!data) {
    return <Message title="No listener here." body={`We couldn't find anyone with the handle @${handle}.`} />;
  }

  const { profile, posts, following } = data;
  const isMe = viewer.id === profile.id;
  const reviews = posts.filter((p) => p.review);

  return (
    <div>
      <PageHeader
        title={profile.displayName}
        subtitle={`${profile.ratingCount.toLocaleString()} ${profile.ratingCount === 1 ? "rating" : "ratings"}`}
      />
      <ProfileHeader
        profile={profile}
        viewerId={viewer.id}
        isMe={isMe}
        following={following}
        onFollowChange={reload}
        onImagesChange={reload}
      />
      <Tabs label="Profile sections" tabs={TABS} value={tab} onChange={setTab} />

      <div ref={panel}>
        {tab === "ratings" && <RatingsTab posts={posts} profile={profile} isMe={isMe} onDeleted={reload} />}
        {tab === "reviews" &&
          (reviews.length > 0 ? (
            <ol>
              {reviews.map((post) => (
                <li key={post.id}>
                  <PostCard post={post} onDeleted={reload} />
                </li>
              ))}
            </ol>
          ) : (
            <p className="px-6 py-12 text-center text-sm text-muted">
              {isMe ? "You haven't written a review yet." : `${profile.displayName} hasn't written a review yet.`}
            </p>
          ))}
        {tab === "reposts" && <RepostsTab profile={profile} isMe={isMe} viewerId={viewer.id} />}
        {tab === "likes" && <LikesTab profile={profile} isMe={isMe} viewerId={viewer.id} />}
      </div>
    </div>
  );
}

interface ActivityTabProps {
  profile: ProfileWithStats;
  isMe: boolean;
  viewerId: string;
}

function RepostsTab({ profile, isMe, viewerId }: ActivityTabProps) {
  const { data, error, reload } = useAsync(() => listRepostsByUser(profile.id, viewerId), [profile.id, viewerId]);
  useRealtimeRefresh(["ratings", "likes", "reposts", "comments"], reload);
  return (
    <ActivityList
      items={data}
      error={error}
      onDeleted={reload}
      empty={isMe ? "You haven't reposted anything yet." : `${profile.displayName} hasn't reposted anything yet.`}
    />
  );
}

function LikesTab({ profile, isMe, viewerId }: ActivityTabProps) {
  const { data, error, reload } = useAsync(() => listLikesByUser(profile.id, viewerId), [profile.id, viewerId]);
  useRealtimeRefresh(["ratings", "likes", "reposts", "comments"], reload);
  return (
    <ActivityList
      items={data?.map((post) => ({ post, repostedBy: null }))}
      error={error}
      onDeleted={reload}
      empty={isMe ? "You haven't liked anything yet." : `${profile.displayName} hasn't liked anything yet.`}
    />
  );
}

interface ActivityListProps {
  items: FeedItem[] | undefined;
  error: Error | null;
  onDeleted: () => void;
  empty: string;
}

function ActivityList({ items, error, onDeleted, empty }: ActivityListProps) {
  if (error) return <p className="px-6 py-12 text-center text-sm text-danger">{error.message}</p>;
  if (!items) {
    return (
      <div className="animate-pulse p-4" aria-busy="true" aria-label="Loading posts">
        <div className="h-32 rounded-xl bg-field" />
      </div>
    );
  }
  if (items.length === 0) return <p className="px-6 py-12 text-center text-sm text-muted">{empty}</p>;
  return (
    <ol>
      {items.map(({ post, repostedBy }) => (
        <li key={post.id}>
          <PostCard post={post} repostedBy={repostedBy} onDeleted={onDeleted} />
        </li>
      ))}
    </ol>
  );
}

interface RatingsTabProps {
  posts: PostWithAuthor[];
  profile: ProfileWithStats;
  isMe: boolean;
  onDeleted: () => void;
}

function RatingsTab({ posts, profile, isMe, onDeleted }: RatingsTabProps) {
  const [view, setView] = useState<"grid" | "list">("grid");
  const highestRated = [...posts].sort((a, b) => b.rating - a.rating).slice(0, 4);
  // Only worth showing once it isn't just the full list again.
  const showHighestRated = posts.length > highestRated.length;

  if (posts.length === 0) {
    return (
      <>
        <div className="border-b border-line px-6 py-12 text-center">
          <p className="text-lg font-extrabold">No ratings yet.</p>
          <p className="mt-1 text-sm text-muted">
            {isMe ? "Rate your first album to start your profile." : `${profile.displayName} hasn't rated anything yet.`}
          </p>
          {isMe && (
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Link to="/rate" className="btn btn-primary">
                Rate an album
              </Link>
              <CreateListLink />
            </div>
          )}
        </div>
        <ProfileLists userId={profile.id} />
      </>
    );
  }

  return (
    <>
      <div className={`grid gap-5 border-b border-line p-4 ${showHighestRated ? "sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]" : ""}`}>
        <div>
          <RatingHistogram ratings={posts.map((p) => p.rating)} />
          {isMe && <CreateListLink className="mt-3 h-8 w-full text-xs" />}
        </div>
        {showHighestRated && (
          <section aria-labelledby="top-rated">
            <h2 id="top-rated" className="text-sm font-extrabold">
              Highest rated
            </h2>
            <ul className="mt-2 grid grid-cols-4 gap-2">
              {highestRated.map((post) => (
                <li key={post.id}>
                  <RatingTile post={post} />
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <ProfileLists userId={profile.id} />

      <section aria-labelledby="all-ratings">
        <div className="flex items-center justify-between px-4 pb-1 pt-3">
          <h2 id="all-ratings" className="text-sm font-extrabold">
            All ratings <span className="ml-1 font-semibold text-muted">{posts.length}</span>
          </h2>
          <div className="flex gap-0.5" role="group" aria-label="Layout">
            <ViewToggle active={view === "grid"} label="Grid view" onClick={() => setView("grid")}>
              <GridIcon size={16} />
            </ViewToggle>
            <ViewToggle active={view === "list"} label="List view" onClick={() => setView("list")}>
              <ListIcon size={16} />
            </ViewToggle>
          </div>
        </div>

        {view === "grid" ? (
          <ul className="grid grid-cols-3 gap-x-2.5 gap-y-4 px-4 pb-6 pt-2 sm:grid-cols-5">
            {posts.map((post) => (
              <li key={post.id}>
                <RatingTile post={post} showTitle />
              </li>
            ))}
          </ul>
        ) : (
          <ol className="border-t border-line">
            {posts.map((post) => (
              <li key={post.id}>
                <PostCard post={post} onDeleted={onDeleted} />
              </li>
            ))}
          </ol>
        )}
      </section>
    </>
  );
}

function CreateListLink({ className = "" }: { className?: string }) {
  return (
    <Link to="/lists/new" className={`btn btn-outline ${className}`}>
      <PlusIcon size={14} strokeWidth={2.4} />
      Create list
    </Link>
  );
}

interface ProfileHeaderProps {
  profile: ProfileWithStats;
  viewerId: string;
  isMe: boolean;
  following: boolean;
  onFollowChange: () => void;
  onImagesChange: () => void;
}

function ProfileHeader({ profile, viewerId, isMe, following: savedFollowing, onFollowChange, onImagesChange }: ProfileHeaderProps) {
  const [following, setFollowingState] = useState(savedFollowing);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingImages, setEditingImages] = useState(false);
  useEffect(() => setFollowingState(savedFollowing), [savedFollowing]);

  // Show the change immediately; the reload then confirms it from the database.
  const followerCount = profile.followerCount + (following === savedFollowing ? 0 : following ? 1 : -1);

  const toggleFollow = async () => {
    const next = !following;
    setPending(true);
    setError(null);
    setFollowingState(next);
    try {
      await setFollowing(viewerId, profile.id, next);
      onFollowChange();
    } catch (err) {
      setFollowingState(!next);
      setError((err as Error).message);
    } finally {
      setPending(false);
    }
  };

  return (
    <header className="pb-3">
      <div aria-hidden="true" className="aspect-[3/1] overflow-hidden bg-brand">
        {profile.bannerUrl && <ProfileImage src={profile.bannerUrl} className="h-full w-full object-cover" />}
      </div>
      <div className="px-4">
        <div className="flex items-start justify-between gap-3">
          <Avatar profile={profile} size={72} className="relative -mt-9 ring-4 ring-paper" />
          <div className="mt-2.5 flex flex-col items-end gap-1">
            {isMe ? (
              <button type="button" onClick={() => setEditingImages(true)} className="btn btn-outline">
                Edit picture and banner
              </button>
            ) : following ? (
              <button
                type="button"
                onClick={toggleFollow}
                disabled={pending}
                aria-pressed="true"
                className="group btn btn-outline hover:border-danger hover:bg-transparent hover:text-danger"
              >
                <CheckIcon size={14} strokeWidth={2.4} className="group-hover:hidden" />
                <span className="group-hover:hidden">Following</span>
                <span className="hidden group-hover:inline">Unfollow</span>
              </button>
            ) : (
              <button type="button" onClick={toggleFollow} disabled={pending} aria-pressed="false" className="btn btn-primary">
                <PlusIcon size={14} strokeWidth={2.4} />
                Follow
              </button>
            )}
            {error && <p className="text-xs text-danger">{error}</p>}
          </div>
        </div>

        <p className="mt-2 truncate text-xl font-extrabold leading-tight">{profile.displayName}</p>
        <p className="text-sm text-muted">@{profile.handle}</p>
        {profile.bio && <p className="mt-1.5 text-sm leading-snug">{profile.bio}</p>}

        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <Stat label="Ratings" value={profile.ratingCount} />
          {/* Follower and following lists are private, so only your own open. */}
          <Stat label={followerCount === 1 ? "Follower" : "Followers"} value={followerCount} to={isMe ? "/followers" : undefined} />
          <Stat label="Following" value={profile.followingCount} to={isMe ? "/following" : undefined} />
        </div>
      </div>
      {editingImages && (
        <ProfileImagesDialog
          onClose={() => {
            setEditingImages(false);
            onImagesChange();
          }}
        />
      )}
    </header>
  );
}

function Stat({ label, value, to }: { label: string; value: number; to?: string }) {
  const content = (
    <>
      <span className="font-bold tabular-nums">{value.toLocaleString()}</span> <span className="text-muted">{label}</span>
    </>
  );
  return to ? (
    <Link to={to} className="hover:underline">
      {content}
    </Link>
  ) : (
    <span>{content}</span>
  );
}

function RatingTile({ post, showTitle }: { post: PostWithAuthor; showTitle?: boolean }) {
  return (
    <Link to={`/post/${post.id}`} className="block rounded-lg">
      <figure title={post.review || undefined}>
        <AlbumCover
          src={post.album.coverUrl}
          title={post.album.title}
          className="rounded-lg transition-transform hover:-translate-y-0.5"
        />
        <figcaption className="mt-1 text-xs">
          <span className="font-bold tabular-nums">{formatRating(post.rating)}</span>
          {showTitle && <span className="block truncate text-muted">{post.album.title}</span>}
          <CoverDescription album={post.album} />
        </figcaption>
      </figure>
    </Link>
  );
}

function ViewToggle({
  active,
  label,
  onClick,
  children,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-full p-1.5 transition-colors hover:bg-tint/5 ${active ? "text-ink" : "text-muted hover:text-ink"}`}
    >
      {children}
    </button>
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

function ProfileSkeleton() {
  return (
    <div className="animate-pulse" aria-busy="true" aria-label="Loading profile">
      <div className="aspect-[3/1] bg-field" />
      <div className="px-4">
        <div className="-mt-9 size-[72px] rounded-full bg-field ring-4 ring-paper" />
        <div className="mt-3 h-5 w-48 rounded-full bg-field" />
        <div className="mt-2 h-3.5 w-28 rounded-full bg-field" />
      </div>
      <div className="mt-6 grid grid-cols-5 gap-2.5 px-4">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="aspect-square rounded-lg bg-field" />
        ))}
      </div>
    </div>
  );
}
