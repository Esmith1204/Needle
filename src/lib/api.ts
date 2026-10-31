import type { AuthError, PostgrestError } from "@supabase/supabase-js";
import type { Database } from "../types/database";
import type {
  FeedScope,
  NewPostInput,
  PostWithAuthor,
  Profile,
  ProfileWithStats,
  Post,
  TopAlbum,
} from "../types";
import { missingSupabaseEnv, supabase } from "./supabase";

// The single data-access module the UI talks to. Every function is async,
// talks to Supabase, and returns app-level types (see src/types/index.ts).
// Schema: supabase/migrations/*.sql.

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
type RatingRow = Database["public"]["Tables"]["ratings"]["Row"];

const TIMELINE_LIMIT = 100;

function db() {
  if (!supabase) {
    throw new Error(
      `Supabase isn't connected: this build is missing ${missingSupabaseEnv.join(" and ")}. ` +
        "Set it in .env.local (then restart npm run dev) or in Vercel (then redeploy).",
    );
  }
  return supabase;
}

function fail(error: PostgrestError): never {
  throw new Error(error.message);
}

const toProfile = (row: ProfileRow): Profile => ({
  id: row.id,
  handle: row.handle,
  displayName: row.display_name,
  avatarUrl: row.avatar_url,
  bio: row.bio,
});

const toPost = (row: RatingRow): Post => ({
  id: row.id,
  authorId: row.user_id,
  album: {
    title: row.album_title,
    artist: row.album_artist,
    year: row.album_year,
    coverUrl: row.cover_url,
  },
  // Postgres numeric can arrive as a string.
  rating: Number(row.rating),
  review: row.review,
  method: row.method,
  createdAt: row.created_at,
});

const RATING_WITH_AUTHOR = "*, author:profiles!ratings_user_id_fkey(*)";

function toPostWithAuthor(row: RatingRow & { author: ProfileRow | null }): PostWithAuthor | null {
  return row.author ? { ...toPost(row), author: toProfile(row.author) } : null;
}

// ─── Auth ───────────────────────────────────────────────────────────────────

const AUTH_MESSAGES: Record<string, string> = {
  invalid_credentials: "That email and password don't match an account.",
  email_not_confirmed: "Confirm your email first. Check your inbox for the link.",
  user_already_exists: "An account with this email already exists. Sign in instead.",
  email_exists: "An account with this email already exists. Sign in instead.",
  weak_password: "Choose a stronger password (at least 6 characters).",
  over_email_send_rate_limit: "Too many sign-up emails were sent. Wait a few minutes and try again.",
  email_address_invalid: "That email address isn't valid.",
  signup_disabled: "New sign-ups are turned off for this project.",
};

function authFail(error: AuthError): never {
  // The profile trigger rejects a taken/invalid handle, which Auth reports generically.
  if (/database error saving new user/i.test(error.message)) {
    throw new Error("That handle was just taken. Try another one.");
  }
  throw new Error((error.code && AUTH_MESSAGES[error.code]) || error.message);
}

export async function signIn(email: string, password: string): Promise<void> {
  const { error } = await db().auth.signInWithPassword({ email: email.trim(), password });
  if (error) authFail(error);
}

interface SignUpInput {
  email: string;
  password: string;
  handle: string;
  displayName: string;
}

/** Creates the account; the database trigger creates its profile from the metadata. */
export async function signUp(input: SignUpInput): Promise<{ needsEmailConfirmation: boolean }> {
  const { data, error } = await db().auth.signUp({
    email: input.email.trim(),
    password: input.password,
    options: {
      data: { handle: input.handle.toLowerCase(), display_name: input.displayName.trim() },
      emailRedirectTo: window.location.origin,
    },
  });
  if (error) authFail(error);
  // With email confirmation on, an already-registered email returns a user with no identities.
  if (data.user && data.user.identities?.length === 0) {
    throw new Error(AUTH_MESSAGES.user_already_exists);
  }
  return { needsEmailConfirmation: !data.session };
}

export async function signOut(): Promise<void> {
  const { error } = await db().auth.signOut();
  if (error) authFail(error);
}

export async function isHandleAvailable(handle: string): Promise<boolean> {
  const { data, error } = await db().rpc("handle_available", { candidate: handle });
  if (error) fail(error);
  return data;
}

/** For accounts that exist without a profile (e.g. created from the dashboard). */
export async function createProfile(userId: string, handle: string, displayName: string): Promise<Profile> {
  const { data, error } = await db()
    .from("profiles")
    .insert({ id: userId, handle: handle.toLowerCase(), display_name: displayName.trim() })
    .select()
    .single();
  if (error) {
    if (error.code === "23505") throw new Error("That handle is taken. Try another one.");
    fail(error);
  }
  return toProfile(data);
}

export async function getProfileById(id: string): Promise<Profile | null> {
  const { data, error } = await db().from("profiles").select("*").eq("id", id).maybeSingle();
  if (error) fail(error);
  return data ? toProfile(data) : null;
}

// ─── Profiles & friends ─────────────────────────────────────────────────────

export async function getProfileByHandle(handle: string): Promise<ProfileWithStats | null> {
  const client = db();
  const { data: row, error } = await client
    .from("profiles")
    .select("*")
    .eq("handle", handle.toLowerCase())
    .maybeSingle();
  if (error) fail(error);
  if (!row) return null;

  const { data: stats, error: statsError } = await client
    .from("profile_stats")
    .select("*")
    .eq("id", row.id)
    .maybeSingle();
  if (statsError) fail(statsError);

  return {
    ...toProfile(row),
    ratingCount: stats?.rating_count ?? 0,
    followerCount: stats?.follower_count ?? 0,
    followingCount: stats?.following_count ?? 0,
  };
}

/** People `profileId` has added as friends, most recent first. */
export async function listFriends(profileId: string): Promise<Profile[]> {
  const { data, error } = await db()
    .from("friendships")
    .select("created_at, friend:profiles!friendships_following_id_fkey(*)")
    .eq("follower_id", profileId)
    .order("created_at", { ascending: false });
  if (error) fail(error);
  return data.flatMap((r) => (r.friend ? [toProfile(r.friend)] : []));
}

export async function isFollowing(viewerId: string, profileId: string): Promise<boolean> {
  const { count, error } = await db()
    .from("friendships")
    .select("*", { count: "exact", head: true })
    .eq("follower_id", viewerId)
    .eq("following_id", profileId);
  if (error) fail(error);
  return (count ?? 0) > 0;
}

export async function setFollowing(viewerId: string, profileId: string, follow: boolean): Promise<void> {
  if (viewerId === profileId) throw new Error("You can't add yourself as a friend.");
  const client = db();
  const { error } = follow
    ? await client.from("friendships").upsert(
        { follower_id: viewerId, following_id: profileId },
        { onConflict: "follower_id,following_id", ignoreDuplicates: true },
      )
    : await client.from("friendships").delete().eq("follower_id", viewerId).eq("following_id", profileId);
  if (error) fail(error);
}

/** Profiles matching a name or handle; the newest members when the query is empty. */
export async function searchProfiles(query: string): Promise<Profile[]> {
  // Strip characters that have meaning in PostgREST filter syntax.
  const q = query.replace(/[%_,()*"\\]/g, " ").trim();
  let request = db().from("profiles").select("*").order("created_at", { ascending: false }).limit(30);
  if (q) request = request.or(`handle.ilike."%${q}%",display_name.ilike."%${q}%"`);
  const { data, error } = await request;
  if (error) fail(error);
  return data.map(toProfile);
}

// ─── Ratings ────────────────────────────────────────────────────────────────

export async function listTimeline(scope: FeedScope, viewerId: string): Promise<PostWithAuthor[]> {
  const client = db();
  let request = client
    .from("ratings")
    .select(RATING_WITH_AUTHOR)
    .order("created_at", { ascending: false })
    .limit(TIMELINE_LIMIT);

  if (scope === "friends") {
    const { data: friends, error } = await client
      .from("friendships")
      .select("following_id")
      .eq("follower_id", viewerId);
    if (error) fail(error);
    request = request.in("user_id", [viewerId, ...friends.map((f) => f.following_id)]);
  }

  const { data, error } = await request;
  if (error) fail(error);
  return data.flatMap((row) => toPostWithAuthor(row) ?? []);
}

/** The most-rated albums among recent ratings; ties go to the higher average. */
export async function listTopAlbums(limit: number): Promise<TopAlbum[]> {
  const { data, error } = await db()
    .from("ratings")
    .select("album_title, album_artist, album_year, cover_url, rating")
    .order("created_at", { ascending: false })
    .limit(TIMELINE_LIMIT);
  if (error) fail(error);

  const albums = new Map<string, { album: TopAlbum["album"]; total: number; count: number }>();
  for (const row of data) {
    const key = `${row.album_title}|${row.album_artist ?? ""}`.toLowerCase();
    const entry = albums.get(key) ?? {
      album: { title: row.album_title, artist: row.album_artist, year: row.album_year, coverUrl: row.cover_url },
      total: 0,
      count: 0,
    };
    entry.total += Number(row.rating);
    entry.count += 1;
    albums.set(key, entry);
  }
  return [...albums.values()]
    .map(({ album, total, count }) => ({ album, averageRating: total / count, ratingCount: count }))
    .sort((a, b) => b.ratingCount - a.ratingCount || b.averageRating - a.averageRating)
    .slice(0, limit);
}

export async function listRatingsByUser(userId: string): Promise<PostWithAuthor[]> {
  const { data, error } = await db()
    .from("ratings")
    .select(RATING_WITH_AUTHOR)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) fail(error);
  return data.flatMap((row) => toPostWithAuthor(row) ?? []);
}

export async function saveRating(userId: string, input: NewPostInput): Promise<Post> {
  const { data, error } = await db()
    .from("ratings")
    .insert({
      user_id: userId,
      album_title: input.album.title,
      album_artist: input.album.artist,
      album_year: input.album.year,
      cover_url: input.album.coverUrl,
      rating: input.rating,
      review: input.review,
      method: input.method,
    })
    .select()
    .single();
  if (error) fail(error);
  return toPost(data);
}

export async function deleteRating(ratingId: string): Promise<void> {
  const { error } = await db().from("ratings").delete().eq("id", ratingId);
  if (error) fail(error);
}
