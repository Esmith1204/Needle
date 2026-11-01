import { useNavigate } from "react-router";
import { PageHeader } from "../components/PageHeader";
import { PersonRow } from "../components/PersonRow";
import { Tabs } from "../components/Tabs";
import { useCurrentUser } from "../context/SessionContext";
import { useAsync } from "../hooks/useAsync";
import { useRealtimeRefresh } from "../hooks/useRealtimeRefresh";
import { listFollowers, listFollowing } from "../lib/api";

type FollowList = "followers" | "following";

const TABS: { value: FollowList; label: string }[] = [
  { value: "followers", label: "Followers" },
  { value: "following", label: "Following" },
];

async function loadPeople(viewerId: string) {
  const [followers, following] = await Promise.all([listFollowers(viewerId), listFollowing(viewerId)]);
  return { followers, following };
}

/**
 * /followers and /following — always the signed-in user's own. Nobody can open anyone else's:
 * no route takes a handle, and the database only returns follows the viewer is part of.
 */
export function FollowListPage({ list }: { list: FollowList }) {
  const viewer = useCurrentUser();
  const navigate = useNavigate();
  const { data, error, reload } = useAsync(() => loadPeople(viewer.id), [viewer.id]);
  useRealtimeRefresh(["follows", "profiles"], reload);
  const people = data?.[list];
  const followingIds = new Set(data?.following.map((person) => person.id));

  return (
    <div>
      <PageHeader title={viewer.displayName} subtitle={`@${viewer.handle}`} backTo={`/u/${viewer.handle}`} />
      <Tabs label="People" tabs={TABS} value={list} onChange={(next) => navigate(`/${next}`, { replace: true })} />
      {error ? (
        <p className="px-6 py-12 text-center text-sm text-danger">{error.message}</p>
      ) : !people ? (
        <div className="animate-pulse p-4" aria-busy="true" aria-label="Loading people">
          <div className="h-40 rounded-xl bg-field" />
        </div>
      ) : people.length === 0 ? (
        <p className="px-6 py-12 text-center text-sm text-muted">
          {list === "followers" ? "No one follows you yet." : "You aren't following anyone yet."}
        </p>
      ) : (
        <ul className="py-1">
          {people.map((person) => (
            <PersonRow
              key={person.id}
              person={person}
              viewerId={viewer.id}
              following={followingIds.has(person.id)}
              showBio
              onChange={reload}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
