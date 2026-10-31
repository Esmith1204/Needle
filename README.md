# Needle

A social music rating app: rate albums on a 10-point decimal scale, or rank them by comparison against your past ratings; write short reviews; and follow friends' ratings.

Built with Vite, React, TypeScript, Tailwind CSS v4, React Router, GSAP, and Supabase (Auth, Postgres, Realtime).

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build
```

The app needs a Supabase project. See [Supabase setup](#supabase-setup).

## Routes

| Path          | View                                                                                 |
| ------------- | ------------------------------------------------------------------------------------ |
| `/login`      | Sign in. Every other page redirects here when you're signed out.                     |
| `/signup`     | Create an account: name, handle, email, password                                     |
| `/welcome`    | Pick a name and handle (only for accounts created without one)                       |
| `/`           | Timeline: Everyone / Friends feeds, updates live                                     |
| `/rate`       | Rate an album: **Score it** (0.0–10.0) or **Compare** (unlocks at 10 ratings)        |
| `/discover`   | Search people, add friends, and see popular albums (also the right column on wide screens) |
| `/u/:handle`  | Profile: live counts, histogram, and Ratings / Reviews / Friends tabs                |
| `/profile`    | Redirects to your own profile                                                        |

## Rate by comparison

Inspired by Beli: once you have 10 ratings, **Compare** asks whether you loved the album (7.0–10.0), thought it was fine (4.0–6.9), or didn't like it (0.0–3.9). It then asks "which did you like more?" against your past ratings in that range, using binary search (about 4 questions for 15 albums, 7 for 100). The score is the midpoint between the two albums it lands between. "Too close to call" gives it the same score. Existing ratings are never changed. The logic lives in `src/lib/compareRank.ts`.

## Project layout

```
src/
  components/   Layout, DiscoverPanel, PostCard, ComparisonRater, AlbumSearchField, AuthGuards, AuthLayout, …
  pages/        Login, SignUp, Welcome, Timeline, CreateRating, Discover, Profile
  context/      SessionContext: Supabase auth session + the signed-in user's profile
  hooks/        useAsync, useRealtimeRefresh (Supabase Realtime), useHandleCheck, useEnterList
  lib/
    api.ts          All Supabase reads/writes (auth, profiles, friends, ratings)
    compareRank.ts  Rate-by-comparison logic
    motion.ts       GSAP helpers; every animation respects prefers-reduced-motion
    supabase.ts     Typed Supabase client
    itunes.ts       Album + cover search via the iTunes Search API
    format.ts       Rating/handle validation, formatting, image resizing
  types/        App types + Supabase table types (mirror the migrations)
supabase/migrations/
  001_ratings.sql   ratings table (prototype)
  002_accounts.sql  profiles, sign-up trigger, friendships, ownership rules, realtime
```

## Supabase setup

1. **Create a project** at [supabase.com](https://supabase.com/dashboard).
2. **Run the migrations in order** in **SQL Editor → New query**: `001_ratings.sql` (skip it if you already ran `ratings.sql`), then `002_accounts.sql`.
   `002` deletes any existing ratings. They belonged to the old placeholder user.
3. **Auth settings** (Authentication in the dashboard):
   - **Sign In / Providers → Email:** turn **Confirm email** off for class testing. With it on, new users must click an emailed link before signing in, and Supabase's built-in mailer only sends a few emails per hour.
   - **URL Configuration:** set **Site URL** to your Vercel URL, and add `http://localhost:5173/**` and `https://<your-app>.vercel.app/**` under **Redirect URLs**. Confirmation links use these.
4. **Keys:** click **Connect** (or **Project Settings → API Keys**) and copy the **Project URL** and **publishable key**. Never use the `service_role` or secret key here.
5. **Local env:** create `.env.local` (gitignored):
   ```
   VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   ```
   (`VITE_SUPABASE_ANON_KEY` is also accepted for a legacy anon key.) Restart `npm run dev` after editing.
6. **Vercel:** add the same two variables under **Project → Settings → Environment Variables**, then **redeploy**. Vite bakes them into the build.

## Not built yet

- Likes, bookmarks, comments, and reposts on posts only toggle on screen; they aren't stored.
- Editing your profile (name, bio, avatar) after sign-up.
- Uploaded covers are stored inline in the rating row; moving them to Supabase Storage would be better at scale.
