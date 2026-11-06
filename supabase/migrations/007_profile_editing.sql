-- Needle migration 007: a limit on handle changes, and people to follow by the albums you have in common.
-- Run once in Supabase → SQL Editor, AFTER 006_album_previews.sql. The app before this one keeps
-- working once it's run. The app from this one also works before it's run, but without the limit,
-- and with the newest members as people to follow.
--
-- All or nothing: a failure part way leaves the database as it was.

begin;

-- ─── Handle changes: at most 2 in any 48 hours ──────────────────────────────
-- Names and bios can change any time. Users could already update their handle (migration 002);
-- this logs each change and refuses a third within two days, whatever calls the API.
create table public.handle_changes (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  old_handle text not null,
  new_handle text not null,
  changed_at timestamptz not null default now()
);

create index handle_changes_user_changed_idx on public.handle_changes (user_id, changed_at desc);

-- Readable by its owner, to show how many changes are left. Only the trigger below writes to it.
alter table public.handle_changes enable row level security;
grant select on public.handle_changes to authenticated;

create policy "Users read their own handle changes"
  on public.handle_changes for select to authenticated using (auth.uid() = user_id);
create policy "2FA accounts need a verified session"
  on public.handle_changes as restrictive for all to authenticated
  using ((select public.mfa_satisfied()));

-- The update holds the profile's row lock while this runs, so two changes sent at once are
-- counted one after the other. Changes made from the dashboard or SQL Editor (no signed-in
-- user) are logged but not limited, so a support fix is always possible.
create function public.limit_handle_changes()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  recent int;
  next_allowed timestamptz;
begin
  if new.handle is not distinct from old.handle then
    return new;
  end if;

  if auth.uid() is not null then
    select count(*) into recent
    from public.handle_changes
    where user_id = new.id and changed_at > now() - interval '48 hours';

    if recent >= 2 then
      -- Once the second-newest change is two days old, only one is left in the window.
      select changed_at + interval '48 hours' into next_allowed
      from public.handle_changes
      where user_id = new.id
      order by changed_at desc
      offset 1 limit 1;

      raise exception 'handle_change_limit'
        using errcode = 'P0001',
              detail = to_char(next_allowed at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
    end if;
  end if;

  insert into public.handle_changes (user_id, old_handle, new_handle)
  values (new.id, old.handle, new.handle);
  return new;
end;
$$;
revoke all on function public.limit_handle_changes() from public, anon, authenticated, service_role;

create trigger limit_handle_changes
  before update of handle on public.profiles
  for each row execute function public.limit_handle_changes();

-- ─── People to follow ───────────────────────────────────────────────────────
-- Two ratings of the same release get the same key, however each was found or typed:
-- letter case, punctuation, "(Deluxe)"-style editions, iTunes' " - Single" and " - EP",
-- and a credit that names more than one artist ("Lady Gaga & Bruno Mars" → "lady gaga").
-- The app's sameAlbumKey (src/lib/albumSearch.ts) does the same for its own matching.
create function public.album_match_key(title text, artist text)
returns text
language sql immutable parallel safe set search_path = ''
as $$
  with parts as (
    select
      regexp_replace(lower(title), '\s+-\s+(single|ep)$', '') as title,
      regexp_replace(lower(coalesce(artist, '')), '\s*(,|&|\+).*$|\s+(x|feat\.?|ft\.?|featuring|with)\s+.*$', '') as artist
  ),
  words as (
    select
      btrim(regexp_replace(regexp_replace(title, '\([^)]*\)|\[[^\]]*\]', ' ', 'g'), '[^[:alnum:]]+', ' ', 'g')) as base_title,
      btrim(regexp_replace(title, '[^[:alnum:]]+', ' ', 'g')) as full_title,
      btrim(regexp_replace(artist, '[^[:alnum:]]+', ' ', 'g')) as artist
    from parts
  )
  -- A title that's all edition, like "[Untitled]", keeps it rather than becoming empty.
  select coalesce(nullif(base_title, ''), full_title) || '|' || artist from words;
$$;

create index ratings_album_key_idx on public.ratings (public.album_match_key(album_title, album_artist));

-- Everyone the caller doesn't follow yet: whoever has rated the most of the same albums first,
-- then whoever rated those closest to how the caller did, then the newest members.
-- `keep` stays in the list even when followed, so a row doesn't vanish as its button is pressed.
--
-- Runs as its owner, like profile_stats (migration 005): row security would stop it using the
-- index above, and work out every rating's key on each call instead. So it applies the same
-- limits itself. Ratings and profiles are readable by anyone signed in, it reads only the
-- caller's own follows, and it returns nothing to a 2FA account that hasn't entered its code.
create function public.suggested_people(max_results int default 30, keep uuid[] default '{}')
returns table (
  id uuid,
  handle text,
  display_name text,
  avatar_url text,
  banner_url text,
  bio text,
  created_at timestamptz,
  shared_albums int
)
language sql stable security definer set search_path = ''
as $$
  with mine as (
    select public.album_match_key(r.album_title, r.album_artist) as album_key, avg(r.rating) as rating
    from public.ratings r
    where r.user_id = auth.uid()
    group by 1
  ),
  theirs as (
    select r.user_id, m.album_key, avg(r.rating) as rating
    from public.ratings r
    join mine m on public.album_match_key(r.album_title, r.album_artist) = m.album_key
    where r.user_id <> auth.uid()
    group by r.user_id, m.album_key
  ),
  overlap as (
    select t.user_id, count(*) as shared, avg(abs(t.rating - m.rating)) as gap
    from theirs t
    join mine m on m.album_key = t.album_key
    group by t.user_id
  )
  select p.id, p.handle, p.display_name, p.avatar_url, p.banner_url, p.bio, p.created_at,
    coalesce(o.shared, 0)::int
  from public.profiles p
  left join overlap o on o.user_id = p.id
  where public.mfa_satisfied()
    and p.id <> auth.uid()
    and (
      p.id = any(coalesce(keep, '{}'))
      or not exists (
        select 1 from public.follows f
        where f.follower_id = auth.uid() and f.following_id = p.id
      )
    )
  order by coalesce(o.shared, 0) desc, o.gap asc nulls last, p.created_at desc
  limit least(greatest(coalesce(max_results, 30), 1), 100);
$$;
revoke all on function public.suggested_people(int, uuid[]) from public, anon;
grant execute on function public.suggested_people(int, uuid[]) to authenticated;

commit;
