// App-level domain types (camelCase). The Supabase row types live in
// ./database.ts; the data layer in src/lib/api.ts maps between the two.

import type { RatingMethod } from "./database";

export type { RatingMethod };

export interface Profile {
  id: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  bannerUrl: string | null;
  bio: string;
}

export interface ProfileWithStats extends Profile {
  ratingCount: number;
  followerCount: number;
  followingCount: number;
}

export interface Album {
  title: string;
  artist: string | null;
  year: number | null;
  coverUrl: string;
}

export interface Post {
  id: string;
  authorId: string;
  album: Album;
  /** 0.0 – 10.0, one decimal place. */
  rating: number;
  /** At most 150 characters. Empty string when the user skipped it. */
  review: string;
  method: RatingMethod;
  createdAt: string;
}

export interface PostWithAuthor extends Post {
  author: Profile;
  likeCount: number;
  repostCount: number;
  commentCount: number;
  likedByViewer: boolean;
  repostedByViewer: boolean;
}

/** A post in a feed. `repostedBy` is set when it's there because someone reposted it. */
export interface FeedItem {
  post: PostWithAuthor;
  repostedBy: Profile | null;
}

export interface PostComment {
  id: string;
  ratingId: string;
  author: Profile;
  /** At most 280 characters. */
  body: string;
  createdAt: string;
}

export interface AlbumList {
  id: string;
  ownerId: string;
  title: string;
  /** At most 300 characters. Empty string when the user skipped it. */
  description: string;
  /** In the order they were added. */
  albums: Album[];
}

export interface AlbumListWithOwner extends AlbumList {
  owner: Profile;
}

export interface AlbumListInput {
  title: string;
  description: string;
  albums: Album[];
}

/** Which of a profile's two images: its picture or its banner. */
export type ProfileImageKind = "avatar" | "banner";

/** The part of an image to keep, in the image's own pixels. */
export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface NewPostInput {
  album: Album;
  rating: number;
  review: string;
  method: RatingMethod;
}

/** What the signed-in account can sign in with, for the Settings page. */
export interface AccountSecurity {
  email: string | null;
  /** Created with an email and password; Google-only accounts can add a password later. */
  hasPassword: boolean;
  /** The connected Google account, or null. */
  google: { email: string | null } | null;
  twoFactorEnabled: boolean;
  hasRecoveryCode: boolean;
}

export interface TotpEnrollment {
  factorId: string;
  /** An image data URL for authenticator apps to scan. */
  qrCode: string;
  /** The same key as text, for typing in by hand. */
  secret: string;
}

export type FeedScope = "everyone" | "following";

export interface TopAlbum {
  album: Album;
  averageRating: number;
  ratingCount: number;
}
