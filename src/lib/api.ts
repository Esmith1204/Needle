import type { AuthError, PostgrestError } from "@supabase/supabase-js";
import type { Database } from "../types/database";
import type {
  AccountSecurity,
  AlbumList,
  AlbumListInput,
  AlbumListWithOwner,
  CropRect,
  FeedItem,
  FeedScope,
  NewPostInput,
  PostComment,
  PostWithAuthor,
  Profile,
  ProfileImageKind,
  ProfileWithStats,
  Post,
  RatingMethod,
  TopAlbum,
  TotpEnrollment,
} from "../types";
import { cropImageFile } from "./format";
import { googleSignInEnabled, missingSupabaseEnv, PROFILE_MEDIA_BUCKET, supabase } from "./supabase";

// The single data-access module the UI talks to. Every function is async,
// talks to Supabase, and returns app-level types (see src/types/index.ts).
// Schema: supabase/migrations/*.sql.

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
type RatingRow = Database["public"]["Tables"]["ratings"]["Row"];
type AlbumListRow = Database["public"]["Tables"]["album_lists"]["Row"];
type AlbumListItemRow = Database["public"]["Tables"]["album_list_items"]["Row"];

const TIMELINE_LIMIT = 100;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  bannerUrl: row.banner_url,
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

// Every query using this also filters viewer_like and viewer_repost down to the viewer's own row.
const POST_FIELDS =
  "*, author:profiles!ratings_user_id_fkey(*), likes(count), reposts(count), comments(count), viewer_like:likes(user_id), viewer_repost:reposts(user_id)";

type PostRow = RatingRow & {
  author: ProfileRow | null;
  likes: { count: number }[];
  reposts: { count: number }[];
  comments: { count: number }[];
  viewer_like: { user_id: string }[];
  viewer_repost: { user_id: string }[];
};

function toPostWithAuthor(row: PostRow): PostWithAuthor | null {
  if (!row.author) return null;
  return {
    ...toPost(row),
    author: toProfile(row.author),
    likeCount: row.likes[0]?.count ?? 0,
    repostCount: row.reposts[0]?.count ?? 0,
    commentCount: row.comments[0]?.count ?? 0,
    likedByViewer: row.viewer_like.length > 0,
    repostedByViewer: row.viewer_repost.length > 0,
  };
}

const toAlbumList = (row: AlbumListRow & { items: AlbumListItemRow[] }): AlbumList => ({
  id: row.id,
  ownerId: row.user_id,
  title: row.title,
  description: row.description,
  albums: row.items.map((item) => ({
    title: item.album_title,
    artist: item.album_artist,
    year: item.album_year,
    coverUrl: item.cover_url,
  })),
});

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
  same_password: "That's already your password. Choose a different one.",
  current_password_required: "Enter your current password.",
  current_password_mismatch: "Your current password isn't right.",
  reauthentication_needed: "Sign out and back in, then try changing your password again.",
  mfa_verification_failed: "That code isn't right. Check your app and try again.",
  mfa_challenge_expired: "That took too long. Try again with a new code.",
  mfa_totp_enroll_not_enabled: "Two-factor sign-in is turned off for this project.",
  mfa_totp_verify_not_enabled: "Two-factor sign-in is turned off for this project.",
  insufficient_aal: "Confirm your two-factor code again, then retry.",
  identity_already_exists: "That Google account is already connected to a different Needle account.",
  manual_linking_disabled: "Connecting accounts is turned off for this project.",
  single_identity_not_deletable: "Google is your only way to sign in, so it can't be disconnected.",
  provider_disabled: "Google sign-in isn't set up for this project yet.",
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

// Google shows its account chooser even when one account is signed in, so a shared
// computer can't silently continue as whoever used it last.
const GOOGLE_PROMPT = { prompt: "select_account" };

function appUrl(path: string) {
  return `${window.location.origin}${path}`;
}

/** Sends the browser to Google; it comes back to `returnTo` signed in. */
export async function signInWithGoogle(returnTo = "/", loginHint?: string): Promise<void> {
  // Otherwise Supabase answers the redirect with a bare JSON error page.
  if (!(await googleSignInEnabled())) throw new Error(AUTH_MESSAGES.provider_disabled);
  const { error } = await db().auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: appUrl(returnTo),
      queryParams: loginHint ? { ...GOOGLE_PROMPT, login_hint: loginHint } : GOOGLE_PROMPT,
    },
  });
  if (error) authFail(error);
}

// ─── Two-factor authentication ──────────────────────────────────────────────

/** Sign-in step two: raises this session to the level a 2FA account requires. */
export async function verifyTwoFactorCode(code: string): Promise<void> {
  const { mfa } = db().auth;
  const { data, error } = await mfa.listFactors();
  if (error) authFail(error);
  const factor = data.totp[0];
  if (!factor) throw new Error("This account doesn't have an authenticator app set up.");
  const { error: verifyError } = await mfa.challengeAndVerify({ factorId: factor.id, code: code.trim() });
  if (verifyError) authFail(verifyError);
}

export async function startTwoFactorSetup(): Promise<TotpEnrollment> {
  const { mfa } = db().auth;
  const { data: factors, error: listError } = await mfa.listFactors();
  if (listError) authFail(listError);
  // A setup abandoned before its first code leaves a factor behind that would block this one.
  for (const factor of factors.all) {
    if (factor.factor_type === "totp" && factor.status === "unverified") {
      const { error } = await mfa.unenroll({ factorId: factor.id });
      if (error) authFail(error);
    }
  }
  const { data, error } = await mfa.enroll({
    factorType: "totp",
    issuer: "Needle",
    friendlyName: "Authenticator app",
  });
  if (error) authFail(error);
  return { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
}

export async function finishTwoFactorSetup(factorId: string, code: string): Promise<void> {
  await authorizeAccountChange("enroll_factor");
  const { error } = await db().auth.mfa.challengeAndVerify({ factorId, code: code.trim() });
  if (error) authFail(error);
}

export async function turnOffTwoFactor(): Promise<void> {
  const { mfa } = db().auth;
  const { data, error } = await mfa.listFactors();
  if (error) authFail(error);
  for (const factor of data.totp) {
    await authorizeAccountChange("remove_factor");
    const { error: removeError } = await mfa.unenroll({ factorId: factor.id });
    if (removeError) authFail(removeError);
  }
}

/** Returns a new recovery code, the only time it's readable. Any earlier code stops working. */
export async function createRecoveryCode(): Promise<string> {
  const { data, error } = await db().rpc("create_recovery_code");
  if (error) securityFail(error);
  return data;
}

/** Sign-in step two without an authenticator: turns 2FA off, so the user can set it up again. */
export async function redeemRecoveryCode(code: string): Promise<void> {
  const client = db();
  const { data, error } = await client.rpc("redeem_recovery_code", { code });
  if (error) securityFail(error);
  if (!data) throw new Error("That recovery code isn't right.");
  // The session still lists the removed authenticator until it's refreshed.
  const { error: refreshError } = await client.auth.refreshSession();
  if (refreshError) authFail(refreshError);
  // A lost authenticator may be in someone else's hands, along with their sessions.
  await client.auth.signOut({ scope: "others" });
}

// ─── Account settings ───────────────────────────────────────────────────────

type AccountChange = "link_identity" | "unlink_identity" | "enroll_factor" | "remove_factor" | "add_password";

function securityFail(error: PostgrestError): never {
  if (error.message === "reauthentication_required") {
    throw new Error("That took too long. Press Cancel and confirm it's you again.");
  }
  if (error.code === "PGRST202") {
    throw new Error("This project's database is missing a migration. Run 004_account_protection.sql in the Supabase SQL Editor.");
  }
  fail(error);
}

/** Lets the database allow one change to how this account signs in. See migration 004. */
async function authorizeAccountChange(change: AccountChange): Promise<void> {
  const { error } = await db().rpc("authorize_account_change", { change });
  if (error) securityFail(error);
}

export async function getAccountSecurity(): Promise<AccountSecurity> {
  const client = db();
  const { data, error } = await client.auth.getUser();
  if (error) authFail(error);
  const { data: status, error: statusError } = await client.rpc("account_security_status");
  if (statusError) securityFail(statusError);
  const google = (data.user.identities ?? []).find((identity) => identity.provider === "google");
  return {
    email: data.user.email ?? null,
    hasPassword: status.has_password,
    google: google ? { email: (google.identity_data?.email as string | undefined) ?? null } : null,
    twoFactorEnabled: (data.user.factors ?? []).some((f) => f.factor_type === "totp" && f.status === "verified"),
    hasRecoveryCode: status.has_recovery_code,
  };
}

/** Checks the password without leaving the page. Only for accounts without 2FA: this resets the session to step one. */
export async function confirmPassword(email: string, password: string): Promise<void> {
  const { error } = await db().auth.signInWithPassword({ email, password });
  if (error) {
    throw new Error(error.code === "invalid_credentials" ? "That password isn't right." : error.message);
  }
}

/** How long a Google re-sign-in counts as confirming the action it was started for. */
const JUST_AUTHENTICATED_SECONDS = 300;

/** Whether this session signed in or passed 2FA moments ago, e.g. just back from Google. */
export async function wasJustAuthenticated(): Promise<boolean> {
  const { data } = await db().auth.mfa.getAuthenticatorAssuranceLevel();
  const latest = Math.max(
    0,
    ...(data?.currentAuthenticationMethods ?? []).map((entry) => (typeof entry === "string" ? 0 : entry.timestamp)),
  );
  return Date.now() / 1000 - latest < JUST_AUTHENTICATED_SECONDS;
}

/** Leave out `currentPassword` when adding a first password to a Google-only account. */
export async function changePassword(password: string, currentPassword?: string): Promise<void> {
  const client = db();
  if (currentPassword === undefined) await authorizeAccountChange("add_password");
  // Supabase compares this itself when "Require current password" is on.
  const { error } = await client.auth.updateUser({ password, current_password: currentPassword });
  if (error) authFail(error);
  // Changing a password usually means not trusting whoever else might be signed in.
  await client.auth.signOut({ scope: "others" });
}

/** Sends the browser to Google to connect it; it comes back to `returnTo`. */
export async function connectGoogle(returnTo: string): Promise<void> {
  await authorizeAccountChange("link_identity");
  const { error } = await db().auth.linkIdentity({
    provider: "google",
    options: { redirectTo: appUrl(returnTo), queryParams: GOOGLE_PROMPT },
  });
  if (error) authFail(error);
}

export async function disconnectGoogle(): Promise<void> {
  const client = db();
  const { auth } = client;
  // Supabase won't remove what it sees as the only sign-in method, and a password added
  // to a Google account doesn't count as one until this records it.
  const { error: identityError } = await client.rpc("ensure_email_identity");
  if (identityError) securityFail(identityError);
  const { data, error } = await auth.getUserIdentities();
  if (error) authFail(error);
  const google = data.identities.find((identity) => identity.provider === "google");
  if (!google) return;
  await authorizeAccountChange("unlink_identity");
  const { error: unlinkError } = await auth.unlinkIdentity(google);
  if (unlinkError) authFail(unlinkError);
}

/** Permanently deletes the account and everything it owns. See delete_my_account in migration 003. */
export async function deleteAccount(): Promise<void> {
  const client = db();
  const { data: session } = await client.auth.getSession();
  const { error } = await client.rpc("delete_my_account");
  if (error) securityFail(error);
  // Uploads aren't tied to the account's rows. This session's token still works for them,
  // and a failure here shouldn't look like the account wasn't deleted.
  if (session.session) await removeUploads(session.session.user.id).catch(() => undefined);
  // The account is gone, so this only clears the session stored in this browser.
  await client.auth.signOut({ scope: "local" });
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

// ─── Profile pictures and banners ───────────────────────────────────────────

const IMAGE_MAX_WIDTHS: Record<ProfileImageKind, number> = { avatar: 400, banner: 1500 };

/** Removes this user's uploaded files, keeping `keepPath`. Only `kind`'s files when it's given. */
async function removeUploads(userId: string, kind?: ProfileImageKind, keepPath?: string): Promise<void> {
  const bucket = db().storage.from(PROFILE_MEDIA_BUCKET);
  const { data, error } = await bucket.list(userId, { limit: 100 });
  if (error) throw error;
  const paths = data
    .filter((file) => !kind || file.name.startsWith(`${kind}-`))
    .map((file) => `${userId}/${file.name}`)
    .filter((path) => path !== keepPath);
  if (paths.length > 0) await bucket.remove(paths);
}

/** Points the profile at an upload, or back to its default with null. */
export async function setProfileImage(
  userId: string,
  kind: ProfileImageKind,
  url: string | null,
  uploadedPath?: string,
): Promise<void> {
  const { error } = await db()
    .from("profiles")
    .update(kind === "avatar" ? { avatar_url: url } : { banner_url: url })
    .eq("id", userId);
  if (error) fail(error);
  // The replaced file is only clutter now, so failing to remove it isn't worth reporting.
  await removeUploads(userId, kind, uploadedPath).catch(() => undefined);
}

export async function uploadProfileImage(userId: string, kind: ProfileImageKind, file: File, crop: CropRect): Promise<void> {
  const blob = await cropImageFile(file, crop, IMAGE_MAX_WIDTHS[kind]);
  const path = `${userId}/${kind}-${Date.now()}.${blob.type === "image/gif" ? "gif" : "jpg"}`;
  const bucket = db().storage.from(PROFILE_MEDIA_BUCKET);
  const { error } = await bucket.upload(path, blob, { contentType: blob.type, cacheControl: "31536000" });
  if (error) throw new Error(error.message);
  await setProfileImage(userId, kind, bucket.getPublicUrl(path).data.publicUrl, path);
}

// ─── Profiles & followers ───────────────────────────────────────────────────

export async function getProfileByHandle(handle: string): Promise<ProfileWithStats | null> {
  const client = db();
  const { data: row, error } = await client
    .from("profiles")
    .select("*")
    .eq("handle", handle.toLowerCase())
    .maybeSingle();
  if (error) fail(error);
  if (!row) return null;

  const { data: stats, error: statsError } = await client.rpc("profile_stats", { target: row.id });
  if (statsError) fail(statsError);

  return {
    ...toProfile(row),
    ratingCount: stats?.rating_count ?? 0,
    followerCount: stats?.follower_count ?? 0,
    followingCount: stats?.following_count ?? 0,
  };
}

/** People `profileId` follows, most recent first. The database only shows this to that person. */
export async function listFollowing(profileId: string): Promise<Profile[]> {
  const { data, error } = await db()
    .from("follows")
    .select("created_at, person:profiles!follows_following_id_fkey(*)")
    .eq("follower_id", profileId)
    .order("created_at", { ascending: false });
  if (error) fail(error);
  return data.flatMap((r) => (r.person ? [toProfile(r.person)] : []));
}

/** People following `profileId`, most recent first. The database only shows this to that person. */
export async function listFollowers(profileId: string): Promise<Profile[]> {
  const { data, error } = await db()
    .from("follows")
    .select("created_at, person:profiles!follows_follower_id_fkey(*)")
    .eq("following_id", profileId)
    .order("created_at", { ascending: false });
  if (error) fail(error);
  return data.flatMap((r) => (r.person ? [toProfile(r.person)] : []));
}

export async function isFollowing(viewerId: string, profileId: string): Promise<boolean> {
  const { count, error } = await db()
    .from("follows")
    .select("*", { count: "exact", head: true })
    .eq("follower_id", viewerId)
    .eq("following_id", profileId);
  if (error) fail(error);
  return (count ?? 0) > 0;
}

export async function setFollowing(viewerId: string, profileId: string, follow: boolean): Promise<void> {
  if (viewerId === profileId) throw new Error("You can't follow yourself.");
  const client = db();
  const { error } = follow
    ? await client.from("follows").upsert(
        { follower_id: viewerId, following_id: profileId },
        { onConflict: "follower_id,following_id", ignoreDuplicates: true },
      )
    : await client.from("follows").delete().eq("follower_id", viewerId).eq("following_id", profileId);
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

const REPOST_FIELDS = `created_at, reposter:profiles!reposts_user_id_fkey(*), post:ratings!reposts_rating_id_fkey(${POST_FIELDS})` as const;

/**
 * New ratings and reposts, newest first. A post appears once, at its latest repost.
 * The viewer's own reposts are left out, so reposting doesn't move a post out from under them.
 */
export async function listTimeline(scope: FeedScope, viewerId: string): Promise<FeedItem[]> {
  const client = db();
  let ratingsRequest = client
    .from("ratings")
    .select(POST_FIELDS)
    .eq("viewer_like.user_id", viewerId)
    .eq("viewer_repost.user_id", viewerId)
    .order("created_at", { ascending: false })
    .limit(TIMELINE_LIMIT);
  let repostsRequest = client
    .from("reposts")
    .select(REPOST_FIELDS)
    .eq("post.viewer_like.user_id", viewerId)
    .eq("post.viewer_repost.user_id", viewerId)
    .neq("user_id", viewerId)
    .order("created_at", { ascending: false })
    .limit(TIMELINE_LIMIT);

  if (scope === "following") {
    const { data: following, error } = await client
      .from("follows")
      .select("following_id")
      .eq("follower_id", viewerId);
    if (error) fail(error);
    const followingIds = following.map((f) => f.following_id);
    ratingsRequest = ratingsRequest.in("user_id", [viewerId, ...followingIds]);
    repostsRequest = repostsRequest.in("user_id", followingIds);
  }

  const [ratings, reposts] = await Promise.all([ratingsRequest, repostsRequest]);
  if (ratings.error) fail(ratings.error);
  if (reposts.error) fail(reposts.error);

  const entries = [
    ...ratings.data.map((row) => ({ at: row.created_at, row: row as PostRow, reposter: null })),
    ...reposts.data.map((row) => ({ at: row.created_at, row: row.post as PostRow | null, reposter: row.reposter })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  const seen = new Set<string>();
  const items: FeedItem[] = [];
  for (const { row, reposter } of entries) {
    const post = row && toPostWithAuthor(row);
    if (!post || seen.has(post.id)) continue;
    seen.add(post.id);
    items.push({ post, repostedBy: reposter && toProfile(reposter) });
  }
  return items.slice(0, TIMELINE_LIMIT);
}

export async function getPost(ratingId: string, viewerId: string): Promise<PostWithAuthor | null> {
  if (!UUID_PATTERN.test(ratingId)) return null;
  const { data, error } = await db()
    .from("ratings")
    .select(POST_FIELDS)
    .eq("id", ratingId)
    .eq("viewer_like.user_id", viewerId)
    .eq("viewer_repost.user_id", viewerId)
    .maybeSingle();
  if (error) fail(error);
  return data && toPostWithAuthor(data as PostRow);
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

export async function listRatingsByUser(userId: string, viewerId: string): Promise<PostWithAuthor[]> {
  const { data, error } = await db()
    .from("ratings")
    .select(POST_FIELDS)
    .eq("user_id", userId)
    .eq("viewer_like.user_id", viewerId)
    .eq("viewer_repost.user_id", viewerId)
    .order("created_at", { ascending: false });
  if (error) fail(error);
  return data.flatMap((row) => toPostWithAuthor(row as PostRow) ?? []);
}

/** What `userId` has reposted, latest repost first. */
export async function listRepostsByUser(userId: string, viewerId: string): Promise<FeedItem[]> {
  const { data, error } = await db()
    .from("reposts")
    .select(REPOST_FIELDS)
    .eq("user_id", userId)
    .eq("post.viewer_like.user_id", viewerId)
    .eq("post.viewer_repost.user_id", viewerId)
    .order("created_at", { ascending: false });
  if (error) fail(error);
  return data.flatMap((row) => {
    const post = row.post && toPostWithAuthor(row.post as PostRow);
    return post ? [{ post, repostedBy: row.reposter && toProfile(row.reposter) }] : [];
  });
}

/** What `userId` has liked, latest like first. */
export async function listLikesByUser(userId: string, viewerId: string): Promise<PostWithAuthor[]> {
  const { data, error } = await db()
    .from("likes")
    .select(`created_at, post:ratings!likes_rating_id_fkey(${POST_FIELDS})`)
    .eq("user_id", userId)
    .eq("post.viewer_like.user_id", viewerId)
    .eq("post.viewer_repost.user_id", viewerId)
    .order("created_at", { ascending: false });
  if (error) fail(error);
  return data.flatMap((row) => (row.post && toPostWithAuthor(row.post as PostRow)) || []);
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

export async function updateRating(
  ratingId: string,
  changes: { rating: number; review: string; method: RatingMethod },
): Promise<void> {
  const { error } = await db().from("ratings").update(changes).eq("id", ratingId);
  if (error) fail(error);
}

export async function deleteRating(ratingId: string): Promise<void> {
  const { error } = await db().from("ratings").delete().eq("id", ratingId);
  if (error) fail(error);
}

// ─── Likes, reposts, comments ───────────────────────────────────────────────

export async function setLiked(viewerId: string, ratingId: string, liked: boolean): Promise<void> {
  const client = db();
  const { error } = liked
    ? await client.from("likes").upsert(
        { user_id: viewerId, rating_id: ratingId },
        { onConflict: "user_id,rating_id", ignoreDuplicates: true },
      )
    : await client.from("likes").delete().eq("user_id", viewerId).eq("rating_id", ratingId);
  if (error) fail(error);
}

export async function setReposted(viewerId: string, ratingId: string, reposted: boolean): Promise<void> {
  const client = db();
  const { error } = reposted
    ? await client.from("reposts").upsert(
        { user_id: viewerId, rating_id: ratingId },
        { onConflict: "user_id,rating_id", ignoreDuplicates: true },
      )
    : await client.from("reposts").delete().eq("user_id", viewerId).eq("rating_id", ratingId);
  if (error) fail(error);
}

/** Oldest first, so a conversation reads from the top. */
export async function listComments(ratingId: string): Promise<PostComment[]> {
  const { data, error } = await db()
    .from("comments")
    .select("*, author:profiles!comments_user_id_fkey(*)")
    .eq("rating_id", ratingId)
    .order("created_at", { ascending: true });
  if (error) fail(error);
  return data.flatMap((row) =>
    row.author
      ? [{ id: row.id, ratingId: row.rating_id, author: toProfile(row.author), body: row.body, createdAt: row.created_at }]
      : [],
  );
}

export async function addComment(viewerId: string, ratingId: string, body: string): Promise<void> {
  const { error } = await db().from("comments").insert({ user_id: viewerId, rating_id: ratingId, body: body.trim() });
  if (error) fail(error);
}

export async function deleteComment(commentId: string): Promise<void> {
  const { error } = await db().from("comments").delete().eq("id", commentId);
  if (error) fail(error);
}

// ─── Album lists ────────────────────────────────────────────────────────────

const LIST_FIELDS = "*, items:album_list_items(*)";

/** A profile's lists, newest first. */
export async function listAlbumLists(userId: string): Promise<AlbumList[]> {
  const { data, error } = await db()
    .from("album_lists")
    .select(LIST_FIELDS)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .order("sort_order", { referencedTable: "items" });
  if (error) fail(error);
  return data.map(toAlbumList);
}

export async function getAlbumList(listId: string): Promise<AlbumListWithOwner | null> {
  if (!UUID_PATTERN.test(listId)) return null;
  const { data, error } = await db()
    .from("album_lists")
    .select(`${LIST_FIELDS}, owner:profiles!album_lists_user_id_fkey(*)`)
    .eq("id", listId)
    .order("sort_order", { referencedTable: "items" })
    .maybeSingle();
  if (error) fail(error);
  return data?.owner ? { ...toAlbumList(data), owner: toProfile(data.owner) } : null;
}

/** Creates a list, or replaces one's details and albums when `listId` is given. Returns its id. */
export async function saveAlbumList(input: AlbumListInput, listId: string | null = null): Promise<string> {
  const { data, error } = await db().rpc("save_album_list", {
    list_id: listId,
    list_title: input.title,
    list_description: input.description,
    albums: input.albums,
  });
  if (error) fail(error);
  return data;
}

export async function deleteAlbumList(listId: string): Promise<void> {
  const { error } = await db().from("album_lists").delete().eq("id", listId);
  if (error) fail(error);
}
