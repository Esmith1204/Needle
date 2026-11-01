-- Needle migration 006: which album a rating is, on the services that can play a preview of it.
-- Run once in Supabase → SQL Editor, AFTER 005_social.sql, and before deploying the matching app.
-- The app before this one keeps working once it's run.

-- Both empty for older ratings and for albums typed in by hand: the app looks those up by title and artist.
-- Digits only, because the app builds a player's address from these, and anyone can write to their own rows.
alter table public.ratings
  add column deezer_album_id text check (deezer_album_id ~ '^[0-9]{1,20}$'),
  add column itunes_album_id text check (itunes_album_id ~ '^[0-9]{1,20}$');
