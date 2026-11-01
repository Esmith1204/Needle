// App-level domain types (camelCase). The Supabase row types live in
// ./database.ts; the data layer in src/lib/api.ts maps between the two.

import type { RatingMethod } from "./database";

export type { RatingMethod };

export interface Profile {
  id: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
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

export type FeedScope = "everyone" | "friends";

export interface TopAlbum {
  album: Album;
  averageRating: number;
  ratingCount: number;
}
