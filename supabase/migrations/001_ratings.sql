-- Needle migration 001: the `ratings` table (prototype, before accounts existed).
-- Run once in Supabase → SQL Editor, then run 002_accounts.sql, which ties ratings to
-- real accounts and replaces this file's open access rules.

create table public.ratings (
  id           uuid primary key default gen_random_uuid(),
  -- Hardcoded dummy user until auth exists (see DUMMY_USER_ID in CreateRatingPage.tsx).
  -- Once auth is added: `references auth.users (id) on delete cascade`.
  user_id      uuid not null,
  album_title  text not null check (char_length(album_title) between 1 and 200),
  album_artist text,
  album_year   int check (album_year between 1000 and 3000),
  -- An https artwork URL, or a downscaled uploaded image as a data URL (≈100 KB).
  cover_url    text not null check (
    cover_url ~ '^(https://|data:image/)' and char_length(cover_url) <= 400000
  ),
  -- 10-point decimal scale: 0.0 – 10.0, one decimal place.
  rating       numeric(3, 1) not null check (rating >= 0 and rating <= 10),
  review       text not null default '' check (char_length(review) <= 150),
  created_at   timestamptz not null default now()
);

create index ratings_user_created_idx on public.ratings (user_id, created_at desc);
create index ratings_created_idx on public.ratings (created_at desc);

-- ─── Access ─────────────────────────────────────────────────────────────────
-- PROTOTYPE ONLY: there is no login yet, so the browser (the `anon` role) may
-- read every rating and insert new ones. Anyone with the anon key can do the
-- same. No update/delete policies exist, so rows can't be edited or removed
-- from the app. When auth is added, replace the insert policy's check with
-- `auth.uid() = user_id` and restrict it `to authenticated`.
alter table public.ratings enable row level security;

grant select, insert on public.ratings to anon, authenticated;

create policy "Ratings are readable by everyone"
  on public.ratings for select
  to anon, authenticated
  using (true);

create policy "Prototype: anyone can add a rating"
  on public.ratings for insert
  to anon, authenticated
  with check (true);
