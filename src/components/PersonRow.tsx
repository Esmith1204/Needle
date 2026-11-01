import { useRef, useState } from "react";
import { Link } from "react-router";
import { setFollowing } from "../lib/api";
import { pop } from "../lib/motion";
import type { Profile } from "../types";
import { Avatar } from "./Avatar";
import { CheckIcon, PlusIcon } from "./Icons";

interface PersonRowProps {
  person: Profile;
  viewerId: string;
  following: boolean;
  showBio: boolean;
  onChange: () => void;
}

/** One person in a list: links to their profile, with a button to follow or unfollow them. */
export function PersonRow({ person, viewerId, following, showBio, onChange }: PersonRowProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const button = useRef<HTMLButtonElement>(null);

  const toggle = async () => {
    setPending(true);
    setError(null);
    try {
      await setFollowing(viewerId, person.id, !following);
      pop(button.current);
      onChange();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(false);
    }
  };

  return (
    <li className="flex items-center gap-2.5 px-4 py-2">
      <Link to={`/u/${person.handle}`} className="group flex min-w-0 flex-1 items-center gap-2.5">
        <Avatar profile={person} size={36} />
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-sm font-bold group-hover:underline">{person.displayName}</span>
          <span className="block truncate text-xs text-muted">@{person.handle}</span>
          {showBio && person.bio && <span className="mt-0.5 block truncate text-xs">{person.bio}</span>}
        </span>
      </Link>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <button
          ref={button}
          type="button"
          onClick={toggle}
          disabled={pending}
          aria-pressed={following}
          aria-label={`${following ? "Unfollow" : "Follow"} ${person.displayName}`}
          className={`btn h-8 px-3 text-xs ${following ? "btn-outline" : "btn-primary"}`}
        >
          {following ? <CheckIcon size={13} strokeWidth={2.4} /> : <PlusIcon size={13} strokeWidth={2.4} />}
          {following ? "Following" : "Follow"}
        </button>
        {error && <p className="text-xs text-danger">{error}</p>}
      </div>
    </li>
  );
}
