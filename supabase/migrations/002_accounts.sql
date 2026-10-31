-- Needle migration 002: accounts, profiles, friends, and rating ownership.
-- Run once in Supabase → SQL Editor, AFTER 001_ratings.sql.
--
-- ⚠ This deletes every existing row in `ratings`. They were all saved under the
--   prototype's placeholder user, which has no account to attach them to.

-- ─── Profiles (one per account) ─────────────────────────────────────────────
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  handle       text not null unique check (handle ~ '^[a-z0-9_.]{3,20}$'),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 50),
  avatar_url   text,
  bio          text not null default '' check (char_length(bio) <= 160),
  created_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;
grant select, insert on public.profiles to authenticated;
grant update (handle, display_name, avatar_url, bio) on public.profiles to authenticated;

create policy "Signed-in users can read profiles"
  on public.profiles for select to authenticated using (true);
create policy "Users create their own profile"
  on public.profiles for insert to authenticated with check (auth.uid() = id);
create policy "Users update their own profile"
  on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- Lets the sign-up form check a handle before the account exists.
create function public.handle_available(candidate text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select not exists (select 1 from public.profiles where handle = lower(candidate));
$$;
revoke all on function public.handle_available(text) from public;
grant execute on function public.handle_available(text) to anon, authenticated;

-- Creates the profile from the sign-up form's metadata:
--   supabase.auth.signUp({ email, password, options: { data: { handle, display_name } } })
-- Accounts created without a handle (e.g. from the dashboard) get no profile;
-- the app asks them to pick one on first sign-in.
create function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.raw_user_meta_data ->> 'handle' is null then
    return new;
  end if;
  insert into public.profiles (id, handle, display_name)
  values (
    new.id,
    lower(new.raw_user_meta_data ->> 'handle'),
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''), new.raw_user_meta_data ->> 'handle')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── Ratings now belong to real accounts ────────────────────────────────────
delete from public.ratings;  -- placeholder-user rows (see warning above)

alter table public.ratings
  add constraint ratings_user_id_fkey foreign key (user_id) references public.profiles (id) on delete cascade;

-- How the score was chosen: typed in, or placed by comparing against past ratings.
alter table public.ratings
  add column method text not null default 'manual' check (method in ('manual', 'comparison'));

drop policy "Prototype: anyone can add a rating" on public.ratings;
drop policy "Ratings are readable by everyone" on public.ratings;
revoke all on public.ratings from anon;
grant select, insert, delete on public.ratings to authenticated;

create policy "Signed-in users can read ratings"
  on public.ratings for select to authenticated using (true);
create policy "Users add their own ratings"
  on public.ratings for insert to authenticated with check (auth.uid() = user_id);
create policy "Users delete their own ratings"
  on public.ratings for delete to authenticated using (auth.uid() = user_id);

-- ─── Friends ("Add friend" follows someone) ─────────────────────────────────
create table public.friendships (
  follower_id  uuid not null references public.profiles (id) on delete cascade,
  following_id uuid not null references public.profiles (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (follower_id, following_id),
  constraint friendships_no_self check (follower_id <> following_id)
);

create index friendships_following_idx on public.friendships (following_id);

alter table public.friendships enable row level security;
grant select, insert, delete on public.friendships to authenticated;

create policy "Signed-in users can read friendships"
  on public.friendships for select to authenticated using (true);
create policy "Users add their own friends"
  on public.friendships for insert to authenticated with check (auth.uid() = follower_id);
create policy "Users remove their own friends"
  on public.friendships for delete to authenticated using (auth.uid() = follower_id);

-- ─── Profile header counts ──────────────────────────────────────────────────
create view public.profile_stats with (security_invoker = true) as
select
  p.id,
  (select count(*) from public.ratings     r where r.user_id      = p.id)::int as rating_count,
  (select count(*) from public.friendships f where f.following_id = p.id)::int as follower_count,
  (select count(*) from public.friendships f where f.follower_id  = p.id)::int as following_count
from public.profiles p;

grant select on public.profile_stats to authenticated;

-- ─── Live updates (profile counts, timeline) ────────────────────────────────
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.ratings, public.friendships, public.profiles;
  end if;
end;
$$;
