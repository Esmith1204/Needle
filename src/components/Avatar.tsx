import type { Profile } from "../types";
import { ProfileImage } from "./ProfileImage";

// Gradients around the brand colors, dark enough for white initials; picked deterministically per user.
const TONES = [
  "linear-gradient(135deg, #573a9b, #2755a1)",
  "linear-gradient(135deg, #2755a1, #1f6f8b)",
  "linear-gradient(135deg, #7a3a9b, #573a9b)",
  "linear-gradient(135deg, #3a4a9b, #573a9b)",
  "linear-gradient(135deg, #1f6f8b, #2755a1)",
  "linear-gradient(135deg, #6b3a8f, #2755a1)",
];

function toneFor(id: string) {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return TONES[Math.abs(hash) % TONES.length];
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

interface AvatarProps {
  profile: Pick<Profile, "id" | "displayName" | "avatarUrl">;
  size?: number;
  className?: string;
}

export function Avatar({ profile, size = 40, className = "" }: AvatarProps) {
  const style = { width: size, height: size };
  if (profile.avatarUrl) {
    return (
      <ProfileImage
        src={profile.avatarUrl}
        style={style}
        className={`shrink-0 rounded-full border border-line object-cover ${className}`}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      style={{ ...style, backgroundImage: toneFor(profile.id), fontSize: size * 0.38 }}
      className={`grid shrink-0 place-items-center rounded-full font-bold text-white ${className}`}
    >
      {initials(profile.displayName)}
    </span>
  );
}
