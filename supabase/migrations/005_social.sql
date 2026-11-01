-- Needle migration 005: followers, likes, reposts, comments, album lists, profile pictures and banners.
-- Run once in Supabase → SQL Editor, AFTER 004_account_protection.sql, and deploy the
-- matching app at the same time: the app before this one reads `friendships` and `profile_stats`.
--
-- All or nothing: a failure part way leaves the database as it was.

begin;

-- ─── Friends become followers ───────────────────────────────────────────────
-- Friendships were already one-way (follower_id → following_id), so renaming the table
-- carries every existing row over: whoever added someone now follows them.
alter table public.friendships rename to follows;
alter table public.follows rename constraint friendships_pkey to follows_pkey;
alter table public.follows rename constraint friendships_no_self to follows_no_self;
alter table public.follows rename constraint friendships_follower_id_fkey to follows_follower_id_fkey;
alter table public.follows rename constraint friendships_following_id_fkey to follows_following_id_fkey;
alter index public.friendships_following_idx rename to follows_following_idx;

alter policy "Users add their own friends" on public.follows rename to "Users follow as themselves";
alter policy "Users remove their own friends" on public.follows rename to "Users unfollow as themselves";

-- Follower and following lists are private: you only see the rows you're part of.
drop policy "Signed-in users can read friendships" on public.follows;
create policy "Users read their own followers and following"
  on public.follows for select to authenticated
  using (auth.uid() in (follower_id, following_id));

-- The counts stay public, so they can no longer run with the caller's access to `follows`.
drop view public.profile_stats;

create function public.profile_stats(target uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'rating_count',    (select count(*) from public.ratings r where r.user_id      = target),
    'follower_count',  (select count(*) from public.follows f where f.following_id = target),
    'following_count', (select count(*) from public.follows f where f.follower_id  = target)
  )
  where public.mfa_satisfied();
$$;
revoke all on function public.profile_stats(uuid) from public, anon;
grant execute on function public.profile_stats(uuid) to authenticated;

-- ─── Editing reviews ────────────────────────────────────────────────────────
grant update (rating, review, method) on public.ratings to authenticated;

create policy "Users edit their own ratings"
  on public.ratings for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ─── Likes and reposts ──────────────────────────────────────────────────────
create table public.likes (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  rating_id  uuid not null references public.ratings (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, rating_id)
);

create index likes_rating_idx on public.likes (rating_id);
create index likes_user_created_idx on public.likes (user_id, created_at desc);

create table public.reposts (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  rating_id  uuid not null references public.ratings (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, rating_id)
);

create index reposts_rating_idx on public.reposts (rating_id);
create index reposts_user_created_idx on public.reposts (user_id, created_at desc);
create index reposts_created_idx on public.reposts (created_at desc);

alter table public.likes enable row level security;
alter table public.reposts enable row level security;
grant select, insert, delete on public.likes, public.reposts to authenticated;

create policy "Signed-in users can read likes"
  on public.likes for select to authenticated using (true);
create policy "Users like as themselves"
  on public.likes for insert to authenticated with check (auth.uid() = user_id);
create policy "Users remove their own likes"
  on public.likes for delete to authenticated using (auth.uid() = user_id);

create policy "Signed-in users can read reposts"
  on public.reposts for select to authenticated using (true);
create policy "Users repost as themselves"
  on public.reposts for insert to authenticated with check (auth.uid() = user_id);
create policy "Users remove their own reposts"
  on public.reposts for delete to authenticated using (auth.uid() = user_id);

-- ─── Comments ───────────────────────────────────────────────────────────────
create table public.comments (
  id         uuid primary key default gen_random_uuid(),
  rating_id  uuid not null references public.ratings (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  body       text not null check (char_length(btrim(body)) between 1 and 280),
  created_at timestamptz not null default now()
);

create index comments_rating_created_idx on public.comments (rating_id, created_at);
create index comments_user_idx on public.comments (user_id);

alter table public.comments enable row level security;
grant select, insert, delete on public.comments to authenticated;

create policy "Signed-in users can read comments"
  on public.comments for select to authenticated using (true);
create policy "Users comment as themselves"
  on public.comments for insert to authenticated with check (auth.uid() = user_id);
create policy "Users delete their own comments"
  on public.comments for delete to authenticated using (auth.uid() = user_id);

-- ─── Album lists ────────────────────────────────────────────────────────────
create table public.album_lists (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  title       text not null check (char_length(btrim(title)) between 1 and 80),
  description text not null default '' check (char_length(description) <= 300),
  created_at  timestamptz not null default now()
);

create index album_lists_user_created_idx on public.album_lists (user_id, created_at desc);

create table public.album_list_items (
  id           uuid primary key default gen_random_uuid(),
  list_id      uuid not null references public.album_lists (id) on delete cascade,
  sort_order   int not null,
  album_title  text not null check (char_length(album_title) between 1 and 200),
  album_artist text,
  album_year   int check (album_year between 1000 and 3000),
  cover_url    text not null check (cover_url ~ '^https://' and char_length(cover_url) <= 2048)
);

create index album_list_items_list_idx on public.album_list_items (list_id, sort_order);

alter table public.album_lists enable row level security;
alter table public.album_list_items enable row level security;
grant select, insert, update, delete on public.album_lists to authenticated;
grant select, insert, delete on public.album_list_items to authenticated;

create policy "Signed-in users can read lists"
  on public.album_lists for select to authenticated using (true);
create policy "Users create their own lists"
  on public.album_lists for insert to authenticated with check (auth.uid() = user_id);
create policy "Users edit their own lists"
  on public.album_lists for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users delete their own lists"
  on public.album_lists for delete to authenticated using (auth.uid() = user_id);

create policy "Signed-in users can read list albums"
  on public.album_list_items for select to authenticated using (true);
create policy "Users add albums to their own lists"
  on public.album_list_items for insert to authenticated
  with check (exists (select 1 from public.album_lists l where l.id = list_id and l.user_id = auth.uid()));
create policy "Users remove albums from their own lists"
  on public.album_list_items for delete to authenticated
  using (exists (select 1 from public.album_lists l where l.id = list_id and l.user_id = auth.uid()));

-- Creates a list (no list_id) or replaces one's details and albums, all or nothing.
-- Runs with the caller's access, so the policies above still decide what's allowed.
create function public.save_album_list(list_id uuid, list_title text, list_description text, albums jsonb)
returns uuid
language plpgsql set search_path = ''
as $$
declare
  saved uuid;
begin
  if list_id is null then
    insert into public.album_lists (user_id, title, description)
    values (auth.uid(), btrim(list_title), btrim(list_description))
    returning id into saved;
  else
    update public.album_lists
    set title = btrim(list_title), description = btrim(list_description)
    where id = save_album_list.list_id
    returning id into saved;
    if saved is null then
      raise exception 'list_not_found' using errcode = 'P0002';
    end if;
    delete from public.album_list_items i where i.list_id = saved;
  end if;

  insert into public.album_list_items (list_id, sort_order, album_title, album_artist, album_year, cover_url)
  select saved, entry.ordinal - 1, entry.album ->> 'title', entry.album ->> 'artist',
    (entry.album ->> 'year')::int, entry.album ->> 'coverUrl'
  from jsonb_array_elements(albums) with ordinality as entry(album, ordinal);

  return saved;
end;
$$;
revoke all on function public.save_album_list(uuid, text, text, jsonb) from public, anon;
grant execute on function public.save_album_list(uuid, text, text, jsonb) to authenticated;

-- ─── Two-factor enforcement for the new tables (see migration 003) ──────────
create policy "2FA accounts need a verified session"
  on public.likes as restrictive for all to authenticated
  using ((select public.mfa_satisfied()));
create policy "2FA accounts need a verified session"
  on public.reposts as restrictive for all to authenticated
  using ((select public.mfa_satisfied()));
create policy "2FA accounts need a verified session"
  on public.comments as restrictive for all to authenticated
  using ((select public.mfa_satisfied()));
create policy "2FA accounts need a verified session"
  on public.album_lists as restrictive for all to authenticated
  using ((select public.mfa_satisfied()));
create policy "2FA accounts need a verified session"
  on public.album_list_items as restrictive for all to authenticated
  using ((select public.mfa_satisfied()));

-- ─── Profile pictures and banners ───────────────────────────────────────────
-- Each holds an https link to an upload in the bucket below, which can be an image or a GIF.
-- Never a data URL: profiles are read with every post, so they have to stay small.
alter table public.profiles add column banner_url text;
grant update (banner_url) on public.profiles to authenticated;

alter table public.profiles
  add constraint profiles_avatar_url_https
    check (avatar_url ~ '^https://' and char_length(avatar_url) <= 2048) not valid,
  add constraint profiles_banner_url_https
    check (banner_url ~ '^https://' and char_length(banner_url) <= 2048) not valid;

-- Public to read, like the profiles they appear on. Each user writes only under <their id>/.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-media', 'profile-media', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

create policy "Users see their own profile media"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'profile-media'
    and (storage.foldername(name))[1] = auth.uid()::text
    and (select public.mfa_satisfied())
  );
create policy "Users upload their own profile media"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'profile-media'
    and (storage.foldername(name))[1] = auth.uid()::text
    and (select public.mfa_satisfied())
  );
create policy "Users delete their own profile media"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'profile-media'
    and (storage.foldername(name))[1] = auth.uid()::text
    and (select public.mfa_satisfied())
  );

-- ─── Live updates ───────────────────────────────────────────────────────────
-- `follows` stays in the publication through its rename. Realtime applies the policies
-- above, so a change to a follow only reaches the two people in it.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime
      add table public.likes, public.reposts, public.comments, public.album_lists, public.album_list_items;
  end if;
end;
$$;

commit;
