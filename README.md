# Needle

A social music rating app: rate albums on a 10-point decimal scale, or rank them by comparison against your past ratings; write short reviews; follow people; comment on, like, repost, and share their reviews; and build lists of albums.

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
| `/`           | Timeline: Everyone / Following feeds with reposts, updates live                      |
| `/rate`       | Rate an album: **Score it** (0.0–10.0) or **Compare** (unlocks at 10 ratings)        |
| `/discover`   | Search people, follow them, and see popular albums (also the right column on wide screens) |
| `/u/:handle`  | Profile: banner, live counts, histogram, album lists, and Ratings / Reviews / Reposts / Likes tabs |
| `/profile`    | Redirects to your own profile                                                        |
| `/post/:id`   | One review and its comments. Its author can edit or delete it here                   |
| `/followers`, `/following` | Your own lists. Other people's can't be opened                          |
| `/lists/new`, `/lists/:id`, `/lists/:id/edit` | Create, view, and edit an album list                 |
| `/settings`   | Your email and handle, connected Google account                                      |
| `/settings/accessibility` | Light mode, color options, font size, reduced motion, image descriptions (saved per device) |
| `/settings/security` | Password, two-factor authentication and its recovery code                     |
| `/settings/privacy` | Who can see what, delete your profile                                          |

## Rate by comparison

Inspired by Beli: once you have 10 ratings, **Compare** asks whether you loved the album (7.0–10.0), thought it was fine (4.0–6.9), or didn't like it (0.0–3.9). It then asks "which did you like more?" against your past ratings in that range, using binary search (about 4 questions for 15 albums, 7 for 100). The score is the midpoint between the two albums it lands between. "Too close to call" gives it the same score. Existing ratings are never changed. The logic lives in `src/lib/compareRank.ts`.

## Project layout

```
src/
  components/   Layout, AccountMenu, DiscoverPanel, PostCard, PostActions, ProfileImagesDialog, SettingsPieces, ComparisonRater, AlbumSearchField, AuthGuards, AuthLayout, …
  pages/        Login, SignUp, Welcome, TwoFactorChallenge, Timeline, Post, CreateRating, Discover, Profile, FollowList, Lists, Accessibility, Settings, Security, Privacy
  context/      SessionContext: Supabase auth session + the signed-in user's profile
                PreferencesContext: the accessibility options
  hooks/        useAsync, useRealtimeRefresh (Supabase Realtime), useHandleCheck, useEnterList
  lib/
    api.ts          All Supabase reads/writes (auth, profiles, follows, ratings, likes, reposts, comments, lists)
    compareRank.ts  Rate-by-comparison logic
    motion.ts       GSAP helpers; every animation respects reduced motion (device or Needle setting)
    preferences.ts  Saves the accessibility options and applies them to <html> for index.css
    supabase.ts     Typed Supabase client
    itunes.ts       Album + cover search via the iTunes Search API
    gifCrop.ts      Crops an animated GIF frame by frame, keeping its animation
    format.ts       Rating/handle validation, formatting, image cropping and resizing
  types/        App types + Supabase table types (mirror the migrations)
supabase/migrations/
  001_ratings.sql   ratings table (prototype)
  002_accounts.sql  profiles, sign-up trigger, friendships, ownership rules, realtime
  003_account_security.sql  2FA enforcement on every table, account deletion
  004_account_protection.sql  Server checks on sign-in method changes, recovery codes
  005_social.sql    friendships become follows; likes, reposts, comments, album lists, profile images
```

## Supabase setup

1. **Create a project** at [supabase.com](https://supabase.com/dashboard).
2. **Run the migrations in order** in **SQL Editor → New query**: `001_ratings.sql` (skip it if you already ran `ratings.sql`), then `002_accounts.sql`, then `003_account_security.sql`, then `004_account_protection.sql`, then `005_social.sql`.
   `002` deletes any existing ratings. They belonged to the old placeholder user. `005` keeps everything, and turns each friend into a follow. Deploy the matching app at the same time, because older builds can't read the renamed table.
3. **Auth settings** (Authentication in the dashboard):
   - **Sign In / Providers → Email:** turn on **Require current password when changing password**.
   - **Sign In / Providers → Email:** turn **Confirm email** off for class testing. With it on, new users must click an emailed link before signing in, and Supabase's built-in mailer only delivers to your project's team members, 2 emails per hour. Before real users sign up, [add your own SMTP server](https://supabase.com/docs/guides/auth/auth-smtp) and turn it back on. Until then, anyone can register an email address they don't own.
   - **URL Configuration:** set **Site URL** to your Vercel URL, and add `http://localhost:5173/**` and `https://<your-app>.vercel.app/**` under **Redirect URLs**. Confirmation links use these.
4. **Keys:** click **Connect** (or **Project Settings → API Keys**) and copy the **Project URL** and **publishable key**. Never use the `service_role` or secret key here.
5. **Local env:** create `.env.local` (gitignored):
   ```
   VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   ```
   (`VITE_SUPABASE_ANON_KEY` is also accepted for a legacy anon key.) Restart `npm run dev` after editing.
6. **Vercel:** add the same two variables under **Project → Settings → Environment Variables**, then **redeploy**. Vite bakes them into the build.

### Profile pictures and banners

Upload a JPEG, PNG, WebP, or GIF of up to 25 MB, then crop it. Nothing changes on the profile until you save the crop. Images are saved as JPEGs, and GIFs stay animated. The saved file can be at most 5 MB, the limit on the `profile-media` bucket from migration 005, so a large GIF may need a tighter crop.

### Who can see what

The database enforces this, not just the app. Follower and following lists are readable only by the two people in each follow (migration 005). Their counts stay public through `profile_stats()`, which returns numbers and no names. Because of that rule, someone else's counts only update live when you're part of the change. Everything else on a profile can be read by anyone signed in.

### Google sign-in

1. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials), create an **OAuth client ID** of type **Web application**. Add `https://<your-project-ref>.supabase.co/auth/v1/callback` as an **Authorized redirect URI**.
2. In Supabase, go to **Authentication → Sign In / Providers → Google**, turn it on, and paste the client ID and secret. Until this is done, "Continue with Google" shows a message instead of redirecting.
3. On the same page, turn on **Allow manual linking**. Settings → **Connect** needs it.
4. The **Redirect URLs** from step 3 above already cover the Google return trip.

Migration 004 stops Supabase's automatic merge of a Google sign-in into an existing account with the same email. Someone with a password account signs in with it and connects Google from Settings. After that, either way of signing in works.

### How account security works

- **Two-factor:** an account with 2FA on stays at step one (`aal1`) after a password or Google sign-in until it enters a code. The app shows the code screen, and migration 003's restrictive policies refuse data to anything calling the API directly.
- **Confirm it's you:** changing a password, turning 2FA on or off, creating a recovery code, connecting or disconnecting Google, and deleting a profile each ask for an authenticator code if 2FA is on, otherwise the password, or Google for accounts without one.
- **Server checks:** the database enforces this too. Migration 004's triggers refuse changes to Google, 2FA, and a Google-only account's first password unless the session has just got a one-use grant, which needs a sign-in or 2FA check from the last 10 minutes. `delete_my_account()` applies the same test. Changing an existing password relies on Supabase's **Require current password** setting (see above), so turn that on.
- **Recovery codes:** Supabase's own are still experimental and off by default, so migration 004 adds one. Each 2FA account gets one code, stored hashed. Using it requires passing step one of sign-in, turns 2FA off, and signs out other devices.
- **Lost authenticator and no recovery code:** run this in the SQL Editor, after checking who is asking: `delete from auth.mfa_factors where user_id = '<user id>';`. The dashboard's remove-factor button is refused, because it goes through the same checks as everyone else.
- **Security emails (optional):** Supabase can email users when their password, Google connection, or 2FA changes. Turn these on under **Authentication → Emails** once you have your own SMTP server.

If the triggers ever block something they shouldn't, the top of `004_account_protection.sql` lists the statements that remove them.

## Not built yet

- Editing your name and bio after sign-up.
- Resetting a forgotten password. When this is built, a Google-only account setting its first password this way needs an `add_password` grant, which migration 004's trigger would otherwise refuse.
- Uploaded covers are stored inline in the rating row; moving them to Supabase Storage would be better at scale.
