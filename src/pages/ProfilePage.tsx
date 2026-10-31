import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, Navigate, useParams } from "react-router";
import { AlbumCover } from "../components/AlbumCover";
import { Avatar } from "../components/Avatar";
import { CheckIcon, GridIcon, ListIcon, PlusIcon } from "../components/Icons";
import { PageHeader } from "../components/PageHeader";
import { PostCard } from "../components/PostCard";
import { RatingHistogram } from "../components/RatingHistogram";
import { Tabs } from "../components/Tabs";
import { useCurrentUser } from "../context/SessionContext";
import { useAsync } from "../hooks/useAsync";
import { useRealtimeRefresh } from "../hooks/useRealtimeRefresh";
import { getProfileByHandle, isFollowing, listFriends, listRatingsByUser, setFollowing, signOut } from "../lib/api";
import { formatRating } from "../lib/format";
import { enter, useGSAP } from "../lib/motion";
import type { PostWithAuthor, Profile, ProfileWithStats } from "../types";

type ProfileTab = "ratings" | "reviews" | "friends";

const TABS: { value: ProfileTab; label: string }[] = [
  { value: "ratings", label: "Ratings" },
  { value: "reviews", label: "Reviews" },
  { value: "friends", label: "Friends" },
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
  const [posts, following, friends] = await Promise.all([
    listRatingsByUser(profile.id),
    profile.id === viewerId ? false : isFollowing(viewerId, profile.id),
    listFriends(profile.id),
  ]);
  return { profile, posts, following, friends };
}

function ProfilePage({ handle }: { handle: string }) {
  const viewer = useCurrentUser();
  const { data, loading, error, reload } = useAsync(() => loadProfile(handle, viewer.id), [handle, viewer.id]);
  const [tab, setTab] = useState<ProfileTab>("ratings");
  const panel = useRef<HTMLDivElement>(null);
  // Counts, friends, and ratings update live as anyone rates or adds friends.
  useRealtimeRefresh(["ratings", "friendships", "profiles"], reload);

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

  const { profile, posts, following, friends } = data;
  const isMe = viewer.id === profile.id;
  const reviews = posts.filter((p) => p.review);

  return (
    <div>
      <PageHeader
        title={profile.displayName}
        subtitle={`${profile.ratingCount.toLocaleString()} ${profile.ratingCount === 1 ? "rating" : "ratings"}`}
      />
      <ProfileHeader profile={profile} viewerId={viewer.id} isMe={isMe} following={following} onFollowChange={reload} />
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
        {tab === "friends" && <FriendsList friends={friends} isMe={isMe} />}
      </div>
    </div>
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
      <div className="px-6 py-12 text-center">
        <p className="text-lg font-extrabold">No ratings yet.</p>
        <p className="mt-1 text-sm text-muted">
          {isMe ? "Rate your first album to start your profile." : `${profile.displayName} hasn't rated anything yet.`}
        </p>
        {isMe && (
          <Link to="/rate" className="btn btn-primary mt-4">
            Rate an album
          </Link>
        )}
      </div>
    );
  }

  return (
    <>
      <div className={`grid gap-5 border-b border-line p-4 ${showHighestRated ? "sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]" : ""}`}>
        <RatingHistogram ratings={posts.map((p) => p.rating)} />
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

interface ProfileHeaderProps {
  profile: ProfileWithStats;
  viewerId: string;
  isMe: boolean;
  following: boolean;
  onFollowChange: () => void;
}

function ProfileHeader({ profile, viewerId, isMe, following: savedFollowing, onFollowChange }: ProfileHeaderProps) {
  const [following, setFollowingState] = useState(savedFollowing);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setFollowingState(savedFollowing), [savedFollowing]);

  // Show the change immediately; the reload then confirms it from the database.
  const followerCount = profile.followerCount + (following === savedFollowing ? 0 : following ? 1 : -1);

  const toggleFriend = async () => {
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
      <div aria-hidden="true" className="h-20 bg-brand" />
      <div className="px-4">
        <div className="flex items-start justify-between gap-3">
          <Avatar profile={profile} size={72} className="-mt-9 ring-4 ring-paper" />
          <div className="mt-2.5 flex flex-col items-end gap-1">
            {isMe ? (
              <button type="button" onClick={() => void signOut()} className="btn btn-outline h-8 px-3 text-xs sm:hidden">
                Sign out
              </button>
            ) : following ? (
              <button
                type="button"
                onClick={toggleFriend}
                disabled={pending}
                aria-pressed="true"
                className="group btn btn-outline hover:border-danger hover:bg-transparent hover:text-danger"
              >
                <CheckIcon size={14} strokeWidth={2.4} className="group-hover:hidden" />
                <span className="group-hover:hidden">Friends</span>
                <span className="hidden group-hover:inline">Remove friend</span>
              </button>
            ) : (
              <button type="button" onClick={toggleFriend} disabled={pending} aria-pressed="false" className="btn btn-primary">
                <PlusIcon size={14} strokeWidth={2.4} />
                Add friend
              </button>
            )}
            {error && <p className="text-xs text-danger">{error}</p>}
          </div>
        </div>

        <p className="mt-2 truncate text-xl font-extrabold leading-tight">{profile.displayName}</p>
        <p className="text-sm text-muted">@{profile.handle}</p>
        {profile.bio && <p className="mt-1.5 text-sm leading-snug">{profile.bio}</p>}

        <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <Stat label="Ratings" value={profile.ratingCount} />
          <Stat label="Followers" value={followerCount} />
          <Stat label="Following" value={profile.followingCount} />
        </dl>
      </div>
    </header>
  );
}

function FriendsList({ friends, isMe }: { friends: Profile[]; isMe: boolean }) {
  if (friends.length === 0) {
    return (
      <p className="px-6 py-12 text-center text-sm text-muted">
        No friends yet.
        {isMe && (
          <>
            {" "}
            <Link to="/discover" className="font-semibold text-accent hover:underline">
              Find people
            </Link>
          </>
        )}
      </p>
    );
  }
  return (
    <ul>
      {friends.map((friend) => (
        <li key={friend.id} className="border-b border-line">
          <Link to={`/u/${friend.handle}`} className="group flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.03]">
            <Avatar profile={friend} size={40} />
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-sm font-bold group-hover:underline">{friend.displayName}</span>
              <span className="block truncate text-xs text-muted">@{friend.handle}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-row-reverse gap-1">
      <dt className="text-muted">{label}</dt>
      <dd className="font-bold tabular-nums">{value.toLocaleString()}</dd>
    </div>
  );
}

function RatingTile({ post, showTitle }: { post: PostWithAuthor; showTitle?: boolean }) {
  return (
    <figure title={post.review || undefined}>
      <AlbumCover
        src={post.album.coverUrl}
        title={post.album.title}
        className="rounded-lg transition-transform hover:-translate-y-0.5"
      />
      <figcaption className="mt-1 text-xs">
        <span className="font-bold tabular-nums">{formatRating(post.rating)}</span>
        {showTitle && <span className="block truncate text-muted">{post.album.title}</span>}
      </figcaption>
    </figure>
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
      className={`rounded-full p-1.5 transition-colors hover:bg-white/5 ${active ? "text-ink" : "text-muted hover:text-ink"}`}
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
      <div className="h-20 bg-field" />
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
